#!/bin/bash
# Build and check before pushing
# Run: ./scripts/build-and-check.sh

set -e

echo "🔍 Running pre-push checks..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if node_modules exists
echo "1️⃣ Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found. Running npm install...${NC}"
    npm install
fi
echo -e "${GREEN}✅ Dependencies OK${NC}"
echo ""

# 2. TypeScript check
echo "2️⃣ Checking TypeScript..."
if npm run type-check 2>/dev/null || npx tsc --noEmit; then
    echo -e "${GREEN}✅ TypeScript OK${NC}"
else
    echo -e "${RED}❌ TypeScript errors found!${NC}"
    echo "Fix TypeScript errors before pushing."
    exit 1
fi
echo ""

# 3. Lint check
echo "3️⃣ Running linter..."
if npm run lint 2>/dev/null; then
    echo -e "${GREEN}✅ Linting OK${NC}"
else
    echo -e "${YELLOW}⚠️  Linting warnings found (not blocking)${NC}"
fi
echo ""

# 4. Build
echo "4️⃣ Building project..."
if npm run build; then
    echo -e "${GREEN}✅ Build successful!${NC}"
else
    echo -e "${RED}❌ Build failed!${NC}"
    echo "Fix build errors before pushing."
    exit 1
fi
echo ""

# 5. Check for sensitive data
echo "5️⃣ Checking for sensitive data..."
if git diff --cached | grep -i "password\|secret\|api.*key\|token" | grep -v "PASSWORD_HASH\|search_path"; then
    echo -e "${RED}❌ Possible sensitive data detected in staged files!${NC}"
    echo "Review changes carefully before committing."
    exit 1
else
    echo -e "${GREEN}✅ No sensitive data detected${NC}"
fi
echo ""

# 6. Check migration files
echo "6️⃣ Checking migrations..."
if [ -d "supabase/migrations" ]; then
    MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l)
    echo -e "${GREEN}✅ Found $MIGRATION_COUNT migration files${NC}"
else
    echo -e "${YELLOW}⚠️  No migrations directory${NC}"
fi
echo ""

# Summary
echo "================================"
echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
echo "================================"
echo ""
echo "Ready to commit and push!"
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'your message'"
echo "  git push"
echo ""

