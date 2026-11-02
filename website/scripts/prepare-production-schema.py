#!/usr/bin/env python3
"""Guarded empty-schema installation for the exact owner-created production D1."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import urllib.request

DATABASE_ID = '889a4b96-cabd-43d1-ad45-79f65b0052b0'
DATABASE_NAME = 'rise-roost-production-db'
TABLES = {'workspaces', 'sessions', 'previews', 'assets', 'limits', 'device_links', 'roost_members', 'roost_credentials', 'roost_sessions', 'roost_challenges', 'customer_comments', 'deployment_identity'}
INDEXES = {'roost_member_workspace', 'comments_workspace'}
CATALOG_SQL = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name"

def quoted(name):
    return '"' + name.replace('"', '""') + '"'

def canonical_catalog(rows):
    return sorted((r['type'], r['name'], ' '.join(r['sql'].split())) for r in rows)

def validate_schema(source):
    statements = [s.strip() for s in '\n'.join(line for line in source.splitlines() if not line.lstrip().startswith('--')).split(';') if s.strip()]
    if len(statements) != 14 or any(not s.startswith(('CREATE TABLE ', 'CREATE INDEX ')) for s in statements):
        raise ValueError('Only the reviewed 12 CREATE TABLE and 2 CREATE INDEX statements are allowed.')
    with sqlite3.connect(':memory:') as db:
        db.row_factory = sqlite3.Row
        db.executescript(source)
        catalog = [dict(r) for r in db.execute(CATALOG_SQL)]
        if {r['name'] for r in catalog if r['type'] == 'table'} != TABLES or {r['name'] for r in catalog if r['type'] == 'index'} != INDEXES:
            raise ValueError('The schema differs from the reviewed production table/index allowlist.')
        if any(db.execute('SELECT count(*) FROM ' + quoted(name)).fetchone()[0] for name in TABLES):
            raise ValueError('Schema preparation must not seed any records.')
    return statements, catalog

def install_schema(api, source):
    statements, expected = validate_schema(source)
    metadata = api('/d1/database/' + DATABASE_ID)
    if metadata.get('uuid') != DATABASE_ID or metadata.get('name') != DATABASE_NAME:
        raise ValueError('Production database identity does not match. Nothing may be installed.')
    def query(sql):
        result = api('/d1/database/' + DATABASE_ID + '/query', {'sql': sql})
        if not result or any(r.get('success') is False for r in result):
            raise ValueError('The schema query was not confirmed; inspect without resetting the database.')
        return result
    before = query(CATALOG_SQL)[0]['results']
    already = bool(before)
    if already and canonical_catalog(before) != canonical_catalog(expected):
        raise ValueError('Existing or partial schema differs. Stop; never drop/reset it automatically.')
    if already:
        for name in TABLES:
            if query('SELECT count(*) AS n FROM ' + quoted(name))[0]['results'][0]['n']:
                raise ValueError('Existing production records found. Schema reinitialization is refused.')
    else:
        # One API request; no destructive fallback if a provider error leaves partial DDL.
        query(';\n'.join(statements) + ';')
    after = query(CATALOG_SQL)[0]['results']
    if canonical_catalog(after) != canonical_catalog(expected):
        raise ValueError('Installed schema did not match; do not reset or declare success.')
    counts = {name: query('SELECT count(*) AS n FROM ' + quoted(name))[0]['results'][0]['n'] for name in sorted(TABLES)}
    if any(counts.values()):
        raise ValueError('Unexpected records found. No clean initialization is claimed.')
    return {'database': DATABASE_NAME, 'databaseId': DATABASE_ID, 'tables': 12, 'indexes': 2, 'rows': counts, 'schemaSha256': hashlib.sha256(source.encode()).hexdigest(), 'schemaMatches': True, 'alreadyInstalled': already, 'schemaWriteRequests': 0 if already else 1, 'businessRowsInserted': 0, 'previewOrBetaWrites': 0, 'deployed': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--apply-schema', action='store_true')
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    source = (Path(__file__).resolve().parent.parent / 'production-schema.sql').read_text()
    validate_schema(source)
    if args.plan or not args.apply_schema:
        print(json.dumps({'mode': 'plan', 'database': DATABASE_NAME, 'databaseId': DATABASE_ID, 'tables': 12, 'indexes': 2, 'businessRowsInserted': 0, 'networkRequests': 0, 'deployment': False}))
        return
    if not args.output_dir:
        parser.error('Choose a new private --output-dir for installation evidence.')
    directory = args.output_dir.resolve()
    directory.mkdir(mode=0o700)  # Never overwrite prior evidence.
    account, token = os.environ.get('CLOUDFLARE_ACCOUNT_ID'), os.environ.get('CLOUDFLARE_API_TOKEN')
    if not account or not token:
        raise SystemExit('Configured account credentials are required. No schema request made.')
    def api(path, body=None):
        request = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + account + path, data=json.dumps(body).encode() if body is not None else None, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if not result.get('success'):
            raise ValueError('Cloudflare did not confirm the request; no reset or retry was attempted.')
        return result['result']
    result = install_schema(api, source)
    path = directory / 'schema-verification.json'
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(result, output, indent=2)
    print(json.dumps(result))

if __name__ == '__main__':
    main()
