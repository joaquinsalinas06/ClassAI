import unittest

from changes import JOBS, select


class PathSelectionTest(unittest.TestCase):
    def test_docs_and_graph_do_not_run_product(self):
        self.assertEqual(select(["README.md", "backend/README.md", "docs/issue-graph.md",
                                 "scripts/generate-issue-graph.py", ".github/workflows/issue-dependency-graph.yml"]), set())

    def test_components_and_shared_inputs(self):
        self.assertEqual(select(["backend/backend.py"]), {"backend", "mqtt"})
        self.assertEqual(select(["web/pnpm-lock.yaml"]), {"web"})
        self.assertEqual(select(["mobile/android/app/build.gradle.kts"]), {"android"})
        self.assertEqual(select(["design/tokens.json"]), {"web", "android"})
        self.assertEqual(select(["firmware/classai_node/comfort.h"]), {"firmware", "backend", "web"})
        for path in ("docs/contracts.md", ".github/workflows/product-ci.yml", "scripts/ci/smoke.sh"):
            self.assertEqual(select([path]), set(JOBS))
