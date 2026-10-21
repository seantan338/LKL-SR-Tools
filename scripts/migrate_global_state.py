import os
import re

WEB_DIR = r"d:\candidate_followup\web\app\(dashboard)"
PAGES = [
    "cv-builder/page.js",
    "whatsapp/page.js",
    "talent-pool/page.js",
    "pipeline/page.js",
    "overview/page.js",
    "candidates/page.js",
    "calendar/page.js",
    "analytics/page.js"
]

def migrate_file(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove useState for candidates and loading
    content = re.sub(r'^\s*const\s+\[candidates,\s*setCandidates\]\s*=\s*useState\(\[\]\);\s*\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*const\s+\[loading,\s*setLoading\]\s*=\s*useState\(true\);\s*\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*const\s+\[isLoading,\s*setIsLoading\]\s*=\s*useState\(true\);\s*\n?', '', content, flags=re.MULTILINE)

    # 2. Find useNotifications and append candidates, candidatesLoading
    # Sometimes it's `const { x, y } = useNotifications();`
    if 'useNotifications()' in content:
        # if it doesn't already have candidates, candidatesLoading
        if 'candidates,' not in content or 'candidatesLoading' not in content:
            # We want to insert `candidates, candidatesLoading: loading,` into the destructured object.
            content = re.sub(
                r'const\s*\{([^}]+)\}\s*=\s*useNotifications\(\);',
                r'const { candidates, candidatesLoading: loading, \1 } = useNotifications();',
                content
            )
    else:
        # Need to import useNotifications and add it. But if it's not imported, we need to add the import.
        # Check if imported
        if 'useNotifications' not in content:
            # Add import after useAuth
            content = re.sub(
                r'(import\s+\{([^}]+)\}\s+from\s+[\'"]\.\./\.\./lib/auth-context[\'"];)',
                r'\1\nimport { useNotifications } from "../../lib/notification-context";',
                content
            )
        # Add const { candidates, candidatesLoading: loading } = useNotifications();
        # Right after useAuth()
        content = re.sub(
            r'(const\s+\{.*\}\s*=\s*useAuth\(\);)',
            r'\1\n  const { candidates, candidatesLoading: loading } = useNotifications();',
            content
        )
        
    # 3. Remove useEffect for subscribeToCandidates
    # We will use regex to remove the useEffect block containing subscribeToCandidates
    useEffect_pattern = re.compile(r'^\s*useEffect\(\(\)\s*=>\s*\{[^}]*subscribeToCandidates.*?^\s*\},?\s*\[.*?\]\);\s*\n?', re.MULTILINE | re.DOTALL)
    content = useEffect_pattern.sub('', content)

    # Note: analytics/page.js might have `unsubscribeCandidates` instead of `unsubscribe`
    # The regex `subscribeToCandidates` inside the block will catch it.

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Migrated {filepath}")

for p in PAGES:
    migrate_file(os.path.join(WEB_DIR, p))
