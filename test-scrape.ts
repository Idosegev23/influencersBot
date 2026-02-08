/**
 * Test ScrapeCreators API directly
 * להריץ: npx tsx test-scrape.ts <username>
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if exists
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try .env
  dotenv.config();
}

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = 'https://api.scrapecreators.com';

if (!API_KEY) {
  console.error('❌ Missing SCRAPECREATORS_API_KEY in .env or .env.local');
  console.error('💡 Add it to your .env.local file:');
  console.error('   SCRAPECREATORS_API_KEY=your_api_key_here');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  },
});

async function testProfile(username: string) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Testing: Profile');
  console.log('='.repeat(70));
  
  try {
    const response = await client.get('/v1/instagram/profile', {
      params: { handle: username },
    });
    
    console.log('✅ Status:', response.status);
    console.log('📦 Raw Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error: any) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    return null;
  }
}

async function testPosts(username: string, targetCount: number = 50) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔍 Testing: Posts (v2 with pagination, target: ${targetCount})`);
  console.log('='.repeat(70));
  
  try {
    const allItems: any[] = [];
    let nextMaxId: string | undefined;
    let page = 0;
    
    while (allItems.length < targetCount && page < 10) {
      page++;
      
      const params: any = { 
        handle: username,
        trim: true,
      };
      
      if (nextMaxId) {
        params.next_max_id = nextMaxId;
      }
      
      console.log(`\n📄 Page ${page}:`);
      const response = await client.get('/v2/instagram/user/posts', { params });
      
      const data = response.data;
      const items = data.items || data.posts || [];
      
      if (items.length === 0) {
        console.log('   ⚠️  No items returned');
        break;
      }
      
      allItems.push(...items);
      
      console.log(`   ✅ Got ${items.length} posts (total: ${allItems.length})`);
      console.log(`   More available: ${data.more_available}`);
      console.log(`   Has cursor: ${data.next_max_id ? 'Yes' : 'No'}`);
      
      if (!data.more_available || !data.next_max_id) {
        console.log('   🏁 No more pages');
        break;
      }
      
      nextMaxId = data.next_max_id;
      
      // Delay between pages
      if (allItems.length < targetCount) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    console.log('\n📊 Final Summary:');
    console.log(`   Total posts: ${allItems.length}`);
    
    if (allItems.length > 0) {
      console.log('\n📝 First post keys:');
      console.log(Object.keys(allItems[0]).join(', '));
    }
    
    return {
      items: allItems,
      totalFetched: allItems.length,
      pages: page,
    };
  } catch (error: any) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    return null;
  }
}

async function testHighlights(username: string, maxToTest: number = 3) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Testing: Highlights');
  console.log('='.repeat(70));
  
  try {
    const response = await client.get('/v1/instagram/user/highlights', {
      params: { handle: username },
    });
    
    console.log('✅ Status:', response.status);
    
    const highlights = response.data?.highlights || response.data || [];
    
    console.log('\n📊 Summary:');
    console.log(`   Total highlights: ${highlights.length}`);
    
    if (highlights.length === 0) {
      return [];
    }
    
    console.log('\n📝 First highlight keys:');
    console.log(Object.keys(highlights[0]).join(', '));
    
    // Test getting details for first few highlights
    const highlightsWithDetails = [];
    const toTest = Math.min(maxToTest, highlights.length);
    
    console.log(`\n🔍 Testing ${toTest} highlight details:`);
    
    for (let i = 0; i < toTest; i++) {
      const highlight = highlights[i];
      console.log(`\n   Highlight ${i+1}/${toTest}: ${highlight.title || highlight.id}`);
      
      try {
        const detailResponse = await client.get('/v1/instagram/user/highlight/detail', {
          params: { id: highlight.id },
        });
        
        const detail = detailResponse.data;
        const items = detail.items || [];
        
        console.log(`   ✅ Got ${items.length} items`);
        
        if (items.length > 0) {
          console.log(`   📝 First item keys: ${Object.keys(items[0]).join(', ')}`);
        }
        
        highlightsWithDetails.push({
          ...highlight,
          detail: detail,
          itemsCount: items.length
        });
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.response?.data?.message || error.message}`);
        highlightsWithDetails.push({
          ...highlight,
          error: error.response?.data || error.message
        });
      }
    }
    
    return {
      total: highlights.length,
      tested: highlightsWithDetails,
      all: highlights.slice(0, 15) // Save first 15 for reference
    };
  } catch (error: any) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    return null;
  }
}

async function testComments(postUrl: string) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Testing: Comments');
  console.log('='.repeat(70));
  
  try {
    const response = await client.get('/v2/instagram/post/comments', {
      params: { url: postUrl },
    });
    
    console.log('✅ Status:', response.status);
    console.log('📦 Raw Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    const comments = response.data?.comments || response.data || [];
    
    console.log('\n📊 Summary:');
    console.log(`   Comments in response: ${comments.length}`);
    
    if (comments.length > 0) {
      console.log('\n📝 First comment:');
      console.log(JSON.stringify(comments[0], null, 2));
    }
    
    return comments;
  } catch (error: any) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  const username = process.argv[2];
  
  if (!username) {
    console.error('Usage: npx tsx test-scrape.ts <username>');
    console.error('Example: npx tsx test-scrape.ts the_dekel');
    process.exit(1);
  }
  
  console.log('🚀 Starting ScrapeCreators API Test');
  console.log(`👤 Username: @${username}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...`);
  
  const results: any = {
    username,
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // 1. Test Profile
  console.log('\n📍 Testing Profile...');
  results.tests.profile = await testProfile(username);
  
  // 2. Test Posts (fetch 50)
  console.log('\n📍 Testing Posts...');
  results.tests.posts = await testPosts(username, 50);
  
  // 3. Test Highlights
  console.log('\n📍 Testing Highlights...');
  results.tests.highlights = await testHighlights(username);
  
  // 4. Test Comments (if we have posts)
  if (results.tests.posts && results.tests.posts.items && results.tests.posts.items.length > 0) {
    console.log('\n📍 Testing Comments...');
    const firstPost = results.tests.posts.items[0];
    const postUrl = firstPost.post_url || `https://www.instagram.com/p/${firstPost.shortcode}/`;
    
    console.log(`   Post URL: ${postUrl}`);
    results.tests.comments = await testComments(postUrl);
  }
  
  // Save to JSON file
  const outputPath = path.join(__dirname, 'test-results', `${username}-${Date.now()}.json`);
  const dir = path.dirname(outputPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  // Also save latest
  const latestPath = path.join(__dirname, 'test-results', '.last-run.json');
  fs.writeFileSync(latestPath, JSON.stringify({
    username,
    timestamp: results.timestamp,
    file: path.basename(outputPath)
  }, null, 2));
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Test Complete!');
  console.log(`📁 Results saved to: ${outputPath}`);
  console.log('='.repeat(70));
}

main().catch(console.error);
