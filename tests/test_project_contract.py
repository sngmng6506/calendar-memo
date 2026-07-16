from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ProjectContractTest(unittest.TestCase):
    def test_required_agent_documents_exist(self) -> None:
        required = [
            "README.md",
            "AGENTS.md",
            "CLAUDE.md",
            "docs/PRODUCT_SPEC.md",
            "docs/UX_SPEC.md",
            "docs/ARCHITECTURE.md",
            "docs/DATA_MODEL.md",
            "docs/TEST_PLAN.md",
        ]
        for relative in required:
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_scope_guard_is_documented(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("Scope Guard", agents)
        self.assertIn("로그인", agents)
        self.assertIn("클라우드 동기화", agents)
        self.assertIn("Enter", agents)


if __name__ == "__main__":
    unittest.main()
