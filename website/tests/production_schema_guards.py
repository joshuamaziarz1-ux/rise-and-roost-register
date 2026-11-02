import importlib.util
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('production_schema', ROOT / 'scripts/prepare-production-schema.py')
schema = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schema)
SOURCE = (ROOT / 'production-schema.sql').read_text()

class FakeCloudflare:
    def __init__(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.metadata = {'uuid': schema.DATABASE_ID, 'name': schema.DATABASE_NAME}
        self.writes = 0
    def __call__(self, path, body=None):
        if not path.startswith('/d1/database/' + schema.DATABASE_ID):
            raise AssertionError('A protected/unexpected database was addressed.')
        if body is None:
            return self.metadata
        sql = body['sql']
        if sql.startswith('SELECT'):
            return [{'success': True, 'results': [dict(r) for r in self.db.execute(sql)]}]
        self.writes += 1
        self.db.executescript(sql)
        return [{'success': True, 'results': []}]

class ProductionSchemaGuards(unittest.TestCase):
    def setUp(self): self.api = FakeCloudflare()
    def tearDown(self): self.api.db.close()
    def test_install_empty_only_and_validate_every_table(self):
        result = schema.install_schema(self.api, SOURCE)
        self.assertEqual(result['tables'], 12)
        self.assertEqual(result['indexes'], 2)
        self.assertFalse(any(result['rows'].values()))
        self.assertEqual(self.api.writes, 1)
    def test_second_empty_install_is_read_only(self):
        schema.install_schema(self.api, SOURCE)
        result = schema.install_schema(self.api, SOURCE)
        self.assertTrue(result['alreadyInstalled'])
        self.assertEqual(result['schemaWriteRequests'], 0)
        self.assertEqual(self.api.writes, 1)
    def test_wrong_identity_refuses_before_writes(self):
        self.api.metadata['uuid'] = '21352b95-d7f6-406f-8527-4b8dbcebf1bf'
        with self.assertRaises(ValueError): schema.install_schema(self.api, SOURCE)
        self.assertEqual(self.api.writes, 0)
    def test_existing_business_records_are_never_reset(self):
        self.api.db.executescript(SOURCE)
        self.api.db.execute("INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES('genuine','private','{}','{}','[]','2026-11-02')")
        with self.assertRaises(ValueError): schema.install_schema(self.api, SOURCE)
        self.assertEqual(self.api.writes, 0)
        self.assertEqual(self.api.db.execute('SELECT count(*) FROM workspaces').fetchone()[0], 1)
    def test_partial_or_unknown_schema_is_not_dropped(self):
        self.api.db.execute('CREATE TABLE existing_records(id TEXT)')
        self.api.db.execute("INSERT INTO existing_records VALUES('keep')")
        with self.assertRaises(ValueError): schema.install_schema(self.api, SOURCE)
        self.assertEqual(self.api.writes, 0)
        self.assertEqual(self.api.db.execute('SELECT id FROM existing_records').fetchone()[0], 'keep')
    def test_destructive_or_seed_statements_are_refused_locally(self):
        for extra in ['DROP TABLE workspaces;', "INSERT INTO sessions VALUES('unsafe','unsafe',0);"]:
            with self.assertRaises(ValueError): schema.install_schema(self.api, SOURCE + extra)
        self.assertEqual(self.api.writes, 0)
    def test_preview_pin_schema_cannot_be_added(self):
        with self.assertRaises(ValueError): schema.validate_schema(SOURCE + 'CREATE TABLE studio_pin_settings(id TEXT);')

if __name__ == '__main__': unittest.main()
