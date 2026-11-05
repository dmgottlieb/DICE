"""Regenerate web/test/fixtures/*.json from the Python reference implementation."""
from dice2013r.fixtures import FIXTURE_DIR, write_all

if __name__ == "__main__":
    write_all()
    print(f"wrote fixtures to {FIXTURE_DIR}")
