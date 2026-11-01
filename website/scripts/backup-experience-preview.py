#!/usr/bin/env python3
"""Read only the isolated preview D1 and verify restoration into private local SQLite."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import urllib.request

DATABASE_ID = '21352b95-d7f6-406f-8527-4b8dbcebf1bf'
DATABASE_NAME = 'rise-roost-experience-preview-db'

def quoted(value):
    return '"' + value.replace('"', '""') + '"'

def canonical(rows):
    return sorted(json.dumps(dict(row), sort_keys=True, separators=(',', ':')) for row in rows)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true', help='Print the fixed read-only scope without network or filesystem changes.')
    parser.add_argument('--isolated-preview', action='store_true', help='Explicitly acknowledge the fixed isolated preview database.')
    parser.add_argument('--output-dir', type=Path, help='New private directory; existing paths are never overwritten.')
    args = parser.parse_args()
    if args.plan:
        print(json.dumps({'database': DATABASE_NAME, 'databaseId': DATABASE_ID, 'remoteWrites': 0, 'restoration': 'local SQLite only'}))
        return
    if not args.isolated_preview or not args.output_dir:
        parser.error('Use --isolated-preview and a new --output-dir, or --plan.')
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    if not account or not token:
        raise SystemExit('Configured Cloudflare account credentials are required; no changes made.')
    # No database/account override, remote restore, shell command, DNS or Worker mutation.
    endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database/' + DATABASE_ID + '/query'
    def query(sql):
        request = urllib.request.Request(endpoint, data=json.dumps({'sql': sql}).encode(), headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
        })
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        if not result.get('success') or not result.get('result') or not result['result'][0].get('success', True):
            raise SystemExit('The isolated preview read was not confirmed; backup not declared complete.')
        return result['result'][0]['results']
    def rows(name):
        sql = 'SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' if name == 'assets' else 'SELECT * FROM ' + quoted(name)
        return query(sql)
    # A newly created directory prevents overwriting a prior backup or following its files.
    directory = args.output_dir.resolve()
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        raise SystemExit('Choose a new output directory; an existing backup is never overwritten.')
    schema_query = "SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name"
    schema = query(schema_query)
    tables = [{'name': item['name'], 'sql': item['sql'], 'rows': rows(item['name'])} for item in schema if item['type'] == 'table']
    restored_path = directory / 'restored.sqlite'
    # Create the file privately before SQLite opens it. Credentials never enter stdout.
    descriptor = os.open(restored_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    with sqlite3.connect(restored_path) as restored:
        restored.row_factory = sqlite3.Row
        for table in tables:
            restored.execute(table['sql'])
            for source in table['rows']:
                record = dict(source)
                if table['name'] == 'assets':
                    record['bytes'] = bytes.fromhex(record.pop('bytes_hex'))
                columns = ','.join(quoted(key) for key in record)
                restored.execute('INSERT INTO ' + quoted(table['name']) + ' (' + columns + ') VALUES (' + ','.join('?' for _ in record) + ')', list(record.values()))
        for item in schema:
            if item['type'] == 'index':
                restored.execute(item['sql'])
        for table in tables:
            sql = 'SELECT id,workspace_id,mime,hex(bytes) AS bytes_hex FROM assets' if table['name'] == 'assets' else 'SELECT * FROM ' + quoted(table['name'])
            if canonical(restored.execute(sql).fetchall()) != canonical(table['rows']):
                raise SystemExit('Local restore verification failed for ' + table['name'] + '; no remote writes occurred.')
        restored_schema = [dict(row) for row in restored.execute("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name")]
        if canonical(restored_schema) != canonical(schema):
            raise SystemExit('Restored schema differs; backup not declared complete.')
    # Detect business/auth changes during the read; never label a changing export verified.
    for table in tables:
        if canonical(rows(table['name'])) != canonical(table['rows']):
            raise SystemExit('The preview changed while reading ' + table['name'] + '. Keep this private candidate and retry into a new directory; no remote writes occurred.')
    if canonical(query(schema_query)) != canonical(schema):
        raise SystemExit('The preview schema changed during backup; retry into a new directory. No remote writes occurred.')
    snapshot = {'format': 'rise-roost-private-preview-d1-v1', 'databaseId': DATABASE_ID, 'schema': schema, 'tables': tables}
    encoded = json.dumps(snapshot, sort_keys=True).encode()
    descriptor = os.open(directory / 'snapshot.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(encoded)
    result = {'database': DATABASE_NAME, 'databaseId': DATABASE_ID, 'applicationTables': len(tables), 'explicitIndexes': sum(item['type'] == 'index' for item in schema), 'everyRestoredRecordMatches': True, 'restoredSchemaMatches': True, 'remoteRowsStableDuringRead': True, 'snapshotSha256': hashlib.sha256(encoded).hexdigest(), 'remoteWrites': 0}
    descriptor = os.open(directory / 'verification.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(result, output, indent=2)
    print(json.dumps(result))

if __name__ == '__main__':
    main()
