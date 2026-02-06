/**
 * Script to create Calendly webhook subscription
 * 
 * Usage:
 * 1. Update your .env with CALENDLY_API_KEY (your Personal Access Token)
 * 2. Run: npx tsx scripts/setup-calendly-webhook.ts <your-webhook-url>
 * 
 * Example:
 * npx tsx scripts/setup-calendly-webhook.ts https://your-ngrok-url.ngrok-free.dev/api/webhook/calendly
 */

import 'dotenv/config';

const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
const WEBHOOK_URL = process.argv[2];

if (!CALENDLY_API_KEY || CALENDLY_API_KEY === 'your_calendly_api_key') {
  console.error('❌ Error: Please set CALENDLY_API_KEY in your .env file');
  console.log('\nTo get your API key:');
  console.log('1. Go to https://calendly.com/integrations/api_webhooks');
  console.log('2. Click "Generate New Token" under Personal Access Tokens');
  console.log('3. Copy the token and add it to your .env file');
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error('❌ Error: Please provide your webhook URL as an argument');
  console.log('\nUsage: npx tsx scripts/setup-calendly-webhook.ts <webhook-url>');
  console.log('Example: npx tsx scripts/setup-calendly-webhook.ts https://abc123.ngrok-free.dev/api/webhook/calendly');
  process.exit(1);
}

async function main() {
  try {
    // Step 1: Get current user to get organization URI
    console.log('🔍 Fetching your Calendly account info...');
    
    const userResponse = await fetch('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    const userData = await userResponse.json();
    const organizationUri = userData.resource.current_organization;
    const userUri = userData.resource.uri;
    
    console.log(`✅ Found account: ${userData.resource.name}`);
    console.log(`   Organization: ${organizationUri}`);

    // Step 2: Check existing webhooks
    console.log('\n🔍 Checking existing webhooks...');
    
    const existingWebhooks = await fetch(
      `https://api.calendly.com/webhook_subscriptions?organization=${encodeURIComponent(organizationUri)}&scope=organization`,
      {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const webhooksData = await existingWebhooks.json();
    
    // Check if webhook already exists for this URL
    const existingWebhook = webhooksData.collection?.find(
      (w: any) => w.callback_url === WEBHOOK_URL
    );

    if (existingWebhook) {
      console.log(`✅ Webhook already exists for ${WEBHOOK_URL}`);
      console.log(`   Signing Key: ${existingWebhook.signing_key || 'Not available (check Calendly dashboard)'}`);
      return;
    }

    // Step 3: Create webhook subscription
    console.log('\n📝 Creating webhook subscription...');
    
    const createResponse = await fetch('https://api.calendly.com/webhook_subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        events: [
          'invitee.created',
          'invitee.canceled',
        ],
        organization: organizationUri,
        user: userUri,
        scope: 'user', // Use 'organization' if you want org-wide webhooks
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create webhook: ${error}`);
    }

    const webhookData = await createResponse.json();
    
    console.log('\n✅ Webhook created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Callback URL: ${webhookData.resource.callback_url}`);
    console.log(`Signing Key:  ${webhookData.resource.signing_key}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 Add this to your .env file:');
    console.log(`CALENDLY_WEBHOOK_SECRET=${webhookData.resource.signing_key}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
