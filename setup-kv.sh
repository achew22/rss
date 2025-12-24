#!/bin/bash
set -e

echo "🚀 Setting up KV namespace for RSS Reader..."
echo ""

# Create KV namespace and capture the output
echo "📦 Creating KV namespace..."
OUTPUT=$(npx wrangler kv namespace create RSS_STORE 2>&1)
echo "$OUTPUT"

# Extract the namespace ID from the output
# Looking for patterns like: id = "abc123..." or id: "abc123..."
NAMESPACE_ID=$(echo "$OUTPUT" | grep -oP '(?<=id[=:]\s["\047])[a-f0-9]+(?=["\047])' | head -1)

if [ -z "$NAMESPACE_ID" ]; then
    echo ""
    echo "❌ Could not automatically extract namespace ID."
    echo "Please manually copy the namespace ID from the output above and update wrangler.toml"
    echo ""
    echo "Look for a line like:"
    echo '  id = "abc123def456..."'
    echo ""
    echo "Then update line 26 in wrangler.toml with that ID."
    exit 1
fi

echo ""
echo "✅ Namespace created with ID: $NAMESPACE_ID"
echo ""

# Update wrangler.toml
echo "📝 Updating wrangler.toml..."
sed -i "s/REPLACE_WITH_YOUR_KV_NAMESPACE_ID/$NAMESPACE_ID/" wrangler.toml

echo "✅ wrangler.toml updated!"
echo ""
echo "📋 Next steps:"
echo "  1. Review the changes: git diff wrangler.toml"
echo "  2. Deploy your worker: npx wrangler deploy"
echo "  3. Test adding a feed - it should now persist!"
echo ""
