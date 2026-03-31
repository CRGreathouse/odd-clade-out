#!/bin/sh
set -e

# Process :Zone.Identifier files
count_zone=$(find . -name "*:Zone.Identifier" | wc -l)
if [ "$count_zone" -gt 0 ]; then
    find . -name "*:Zone.Identifier" -delete
    echo "Found and deleted $count_zone :Zone.Identifier files."
fi

# Process .DS_Store files
count_ds=$(find . -name ".DS_Store" | wc -l)
if [ "$count_ds" -gt 0 ]; then
    find . -name ".DS_Store" -delete
    echo "Found and deleted $count_ds .DS_Store files."
fi

echo "==> checks/validate.js"
node checks/validate.js

echo ""
echo "==> tests/test-tree.js"
node tests/test-tree.js

echo ""
echo "==> tests/test-logic.js"
node tests/test-logic.js

echo ""
echo "Pre-commit checks passed."
