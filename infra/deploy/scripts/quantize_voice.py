#!/usr/bin/env python3
"""Quantize a piper VITS ONNX model: fp32 (~77MB) -> int8 (~20MB).

Weight-only, per-channel int8 for every Conv/ConvTranspose weight, stored as
int8 initializers + per-channel scale/zero-point, each feeding a single
DequantizeLinear (int8->fp32) node. The Conv/ConvTranspose ops stay fp32, so
onnxruntime-web WASM runs the model (its kernel set has fp32 Conv but NOT
ConvInteger). Symmetric int8 (zp=0, range [-127,127]) = piper's QInt8 +
reduce_range convention.

Architecture is unchanged (phoneme_id_map, speaker_id_map, sample_rate…), so
the existing <model>.onnx.json still applies — swap only the weights.
"""
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper


def quantize_weights(src: Path, out: Path) -> None:
    model = onnx.load(str(src))
    graph = model.graph

    # Map each Conv/ConvTranspose weight initializer -> the single node that
    # consumes it (piper VITS weights are exclusive to one conv op each).
    consumer_by_weight: dict[str, int] = {}
    for idx, node in enumerate(graph.node):
        if node.op_type in ("Conv", "ConvTranspose") and len(node.input) > 1:
            consumer_by_weight.setdefault(node.input[1], idx)

    by_name = {init.name: init for init in graph.initializer}
    new_initializers: list = []
    dq_by_consumer: dict[int, onnx.NodeProto] = {}
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

    # Rebuild node list: insert each DQ immediately before its Conv, rewire the
    # weight input to the DQ output (topological order preserved).
    nodes = list(graph.node)
    rebuilt: list = []
    for idx, node in enumerate(nodes):
        if idx in dq_by_consumer:
            rebuilt.append(dq_by_consumer[idx])
        if node.op_type in ("Conv", "ConvTranspose") and len(node.input) > 1 and node.input[1] in consumer_by_weight:
            node.input[1] = node.input[1] + "_dq"
        rebuilt.append(node)
    del graph.node[:]
    graph.node.extend(rebuilt)

    # Drop initializers no longer referenced by any node input (the fp32 copies).
    referenced = {inp for node in graph.node for inp in node.input}
    kept = [init for init in graph.initializer if init.name in referenced]
    del graph.initializer[:]
    graph.initializer.extend(kept + new_initializers)

    onnx.checker.check_model(model)
    onnx.save(model, str(out))

    n = len(consumer_by_weight)
    print(f"quantized {n} conv/convtranspose weights: {raw_bytes/1e6:.1f} MB -> {quantized_bytes/1e6:.1f} MB")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    quantize_weights(src, out)
