#!/usr/bin/env python3
"""Quantize a piper VITS ONNX model.

  int8 (default): weight-only per-channel int8 (~20MB) — the SHIPPED path.
  int4 (--int4):  weight-only block-wise int4 (~10MB, opset 21) — the QA
                  artifact for issue #29.

INT8: every Conv/ConvTranspose weight -> int8 initializers + per-channel
scale/zero-point, each feeding a DequantizeLinear (int8->fp32) node. The
Conv/ConvTranspose ops stay fp32, so onnxruntime-web WASM runs the model
(fp32 Conv exists in WASM; ConvInteger does not). Symmetric int8 (zp=0,
range [-127,127]) = piper's QInt8 + reduce_range convention.

INT4: block-wise 4-bit weights along dim 1, packed as INT4 tensor types
(two values per byte, low nibble first) + one DequantizeLinear(block_size)
per weight, opset 21. Requires onnxruntime >= 1.20 (the 1.17 WASM had NO
int4 kernel — proven, see issue #29). Block size is 32 when the dim-1 size
is divisible, else the whole channel (per-channel fallback, always valid).
ORT's blocked-DQ requires scale/zp at the input's full rank — the blocked
axis becomes the block count and every other dim stays at full resolution,
so each block holds one fp32 scale per spatial position. Quality needs a
human listen-QA before this ever ships live.

Architecture is unchanged (phoneme_id_map, speaker_id_map, sample_rate…), so
the existing <model>.onnx.json still applies — swap only the weights.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper


def _conv_weight_consumers(graph) -> dict[str, int]:
    """Map each Conv/ConvTranspose weight initializer -> the single node that
    consumes it (piper VITS weights are exclusive to one conv op each)."""
    consumer_by_weight: dict[str, int] = {}
    for idx, node in enumerate(graph.node):
        if node.op_type in ("Conv", "ConvTranspose") and len(node.input) > 1:
            consumer_by_weight.setdefault(node.input[1], idx)
    return consumer_by_weight


def _rebuild(graph, consumer_by_weight, new_initializers, dq_by_consumer, rewired) -> None:
    """Insert each DQ before its Conv, rewire weight inputs, drop dead fp32
    copies. Topological order preserved."""
    nodes = list(graph.node)
    rebuilt: list = []
    for idx, node in enumerate(nodes):
        if idx in dq_by_consumer:
            rebuilt.append(dq_by_consumer[idx])
        if node.op_type in ("Conv", "ConvTranspose") and len(node.input) > 1 and node.input[1] in rewired:
            node.input[1] = rewired[node.input[1]]
        rebuilt.append(node)
    del graph.node[:]
    graph.node.extend(rebuilt)
    referenced = {inp for node in graph.node for inp in node.input}
    kept = [init for init in graph.initializer if init.name in referenced]
    del graph.initializer[:]
    graph.initializer.extend(kept + new_initializers)


def _pack_uint4(q: np.ndarray) -> bytes:
    """Pack an int8 array of 4-bit values (clipped [-7,7]) into raw bytes, two
    per byte, low nibble first (ONNX uint4 packing — ORT's
    GetPackedUint4Element reads exactly this). Flattens to C-order first (the
    onnx tensor storage order). Robust to odd lengths (the last nibble is
    stored alone in the high-half of the final byte, zero-padded)."""
    u = q.astype(np.uint8).reshape(-1) & 0x0F
    n = u.size
    n2 = n // 2
    packed = np.empty((n + 1) // 2, dtype=np.uint8)
    packed[:n2] = u[: n2 * 2 : 2] | (u[1 : n2 * 2 : 2] << 4)
    if n % 2:
        packed[-1] = u[-1]
    return packed.tobytes()


def _int4_tensor(name: str, values: np.ndarray, shape: tuple, data_type: int) -> onnx.TensorProto:
    t = onnx.TensorProto()
    t.name = name
    t.data_type = data_type
    t.dims.extend(int(d) for d in shape)
    t.raw_data = _pack_uint4(values)
    return t


def quantize_int8(src: Path, out: Path) -> None:
    model = onnx.load(str(src))
    graph = model.graph
    consumer_by_weight = _conv_weight_consumers(graph)
    by_name = {init.name: init for init in graph.initializer}
    new_initializers: list = []
    dq_by_consumer: dict[int, onnx.NodeProto] = {}
    rewired: dict[str, str] = {}
    quantized_bytes = 0
    raw_bytes = 0

    for name in consumer_by_weight:
        init = by_name.get(name)
        if init is None or init.data_type != onnx.TensorProto.FLOAT:
            continue  # not a float weight we own — leave it alone
        w = numpy_helper.to_array(init).astype(np.float32)
        raw_bytes += w.nbytes
        # Per-channel along dim 0 (Conv output-channel / ConvTranspose input-channel).
        flat = w.reshape(w.shape[0], -1)
        maxabs = np.abs(flat).max(axis=1)
        scale = np.where(maxabs > 0, maxabs / 127.0, 1.0).astype(np.float32)
        q = np.clip(np.round(flat / scale[:, None]), -127, 127).astype(np.int8).reshape(w.shape)
        zp = np.zeros(w.shape[0], dtype=np.int8)
        new_initializers += [
            numpy_helper.from_array(q, name + "_q"),
            numpy_helper.from_array(scale, name + "_s"),
            numpy_helper.from_array(zp, name + "_z"),
        ]
        quantized_bytes += q.nbytes
        dq_by_consumer[consumer_by_weight[name]] = helper.make_node(
            "DequantizeLinear", [name + "_q", name + "_s", name + "_z"],
            [name + "_dq"], name + "_DQ", axis=0,
        )
        rewired[name] = name + "_dq"

    _rebuild(graph, consumer_by_weight, new_initializers, dq_by_consumer, rewired)
    onnx.checker.check_model(model)
    onnx.save(model, str(out))
    print(f"int8: quantized {len(consumer_by_weight)} conv/convtranspose weights: "
          f"{raw_bytes/1e6:.1f} MB -> {quantized_bytes/1e6:.1f} MB")


def quantize_int4(src: Path, out: Path, block_size: int = 32) -> None:
    model = onnx.load(str(src))
    graph = model.graph
    # int4 tensor types need opset >= 21 (IR 10).
    model.opset_import.clear()
    opset_entry = model.opset_import.add()
    opset_entry.domain = ""
    opset_entry.version = 21
    model.ir_version = 10

    # Opset migration: in opset 18+, ReduceMean/ReduceMax/etc. moved `axes`
    # from an attribute to an optional INPUT. VITS is built at opset 15 (axes
    # as attribute), so bumping to 21 breaks the checker unless we migrate.
    # Walk every node, and for any op with an `axes` attribute, lift it into an
    # int64 axes initializer wired as input[1].
    REDUCE_AXES_OPS = {
        "ReduceMean", "ReduceMax", "ReduceMin", "ReduceProd", "ReduceSumSquare",
        "ReduceL1", "ReduceL2", "ReduceLogSum", "ReduceLogSumExp",
    }
    axes_init: list = []
    migrated = 0
    for node in graph.node:
        if node.op_type not in REDUCE_AXES_OPS:
            continue
        for ai, attr in enumerate(node.attribute):
            if attr.name == "axes":
                axes_name = (node.name + "_axes") if node.name else f"axes_{migrated}"
                axes_init.append(
                    numpy_helper.from_array(
                        np.array(list(attr.ints), dtype=np.int64), axes_name))
                del node.attribute[ai]
                node.input.append(axes_name)
                migrated += 1
                break

    consumer_by_weight = _conv_weight_consumers(graph)
    by_name = {init.name: init for init in graph.initializer}
    new_initializers: list = []
    dq_by_consumer: dict[int, onnx.NodeProto] = {}
    rewired: dict[str, str] = {}
    quantized_bytes = 0
    raw_bytes = 0
    fallbacks = 0

    for name in consumer_by_weight:
        init = by_name.get(name)
        if init is None or init.data_type != onnx.TensorProto.FLOAT:
            continue
        w = numpy_helper.to_array(init).astype(np.float32)
        raw_bytes += w.nbytes
        # Block along dim 1 (Conv: Cin / ConvTranspose: Cout) so the DQ output
        # keeps the ORIGINAL 4D shape the conv expects.
        axis_dim = w.shape[1]
        bs = block_size if axis_dim % block_size == 0 else axis_dim
        if bs != block_size:
            fallbacks += 1
        n_blocks = axis_dim // bs
        spatial = w.shape[2:]  # (KH, KW, ...)
        blocks = w.reshape(w.shape[0], n_blocks, bs, *spatial)
        # ORT blocked-DQ (quantize_linear.cc PrepareForQDQ) demands scale and
        # zero_point share the INPUT RANK: shape [d0, ceil(d1/bs), KH, KW] —
        # the blocked axis becomes the block count, every other dim is kept at
        # full resolution (one scale per spatial position per block).
        maxabs = np.abs(blocks).max(axis=2)  # [d0, nb, *spatial]
        scale = np.where(maxabs > 0, maxabs / 7.0, 1.0).astype(np.float32)
        q4 = np.clip(np.round(blocks / scale[:, :, None, ...]), -7, 7).astype(np.int8)
        q = q4.reshape(w.shape)
        # Symmetric int4 → zero point is always 0 → omit x_zero_point (the
        # optional input defaults to 0 per the ONNX spec and ORT handles the
        # null-zp path), saving a whole tensor of packed zeros per weight.
        new_initializers += [
            _int4_tensor(name + "_q", q, w.shape, onnx.TensorProto.INT4),
            numpy_helper.from_array(scale, name + "_s"),
        ]
        quantized_bytes += q.size // 2 + scale.nbytes
        dq_by_consumer[consumer_by_weight[name]] = helper.make_node(
            "DequantizeLinear", [name + "_q", name + "_s"],
            [name + "_dq"], name + "_DQ", axis=1, block_size=bs,
        )
        rewired[name] = name + "_dq"

    _rebuild(graph, consumer_by_weight, new_initializers + axes_init, dq_by_consumer, rewired)
    onnx.checker.check_model(model)
    onnx.save(model, str(out))
    print(f"int4: quantized {len(consumer_by_weight)} conv/convtranspose weights: "
          f"{raw_bytes/1e6:.1f} MB -> {quantized_bytes/1e6:.1f} MB "
          f"({fallbacks} per-channel fallbacks, {migrated} axes-attr migrated)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Quantize a piper VITS model: int8 (default) or int4 (--int4).")
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--int4", action="store_true", help="block-wise int4 (opset 21); needs ORT >= 1.20")
    ap.add_argument("--block-size", type=int, default=32)
    args = ap.parse_args()
    if args.int4:
        quantize_int4(Path(args.src), Path(args.out), args.block_size)
    else:
        quantize_int8(Path(args.src), Path(args.out))
