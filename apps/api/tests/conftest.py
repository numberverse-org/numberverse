"""Shared pytest fixtures/options for the API test suite.

Registers the `--db` flag so tenant/isolation tests that need a real Postgres
skip cleanly in CI (which runs the unit tests without a database).
"""

import pytest


def pytest_addoption(parser):
    parser.addoption(
        "--db",
        action="store_true",
        default=False,
        help="Run tests that require a live Postgres database",
    )


@pytest.fixture
def db():
    """A no-op `db` fixture for tests that need an AsyncSession.

    Tests that require a real database are marked `--db`-gated (see
    test_org_isolation.py) and are skipped without the flag.  When the flag
    IS passed, the test file supplies its own async session fixture via this
    hook (or a test-specific fixture overrides it).
    """
    import pytest_asyncio

    raise pytest.skip("requires --db flag and a live Postgres")
