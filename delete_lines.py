#!/usr/bin/env python3
"""Delete obsolete functions from App.tsx"""

# Read the file
with open('App.tsx', 'r') as f:
    lines = f.readlines()

# Delete lines 823-1404 (1-indexed, inclusive)
# In Python 0-indexed: lines 822-1403
new_lines = lines[:822] + lines[1404:]

# Write back
with open('App.tsx', 'w') as f:
    f.writelines(new_lines)

print(f"Deleted {1404 - 822} lines. New file has {len(new_lines)} lines.")
