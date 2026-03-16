/**
 * Instagram Graph API — Main Export
 * נקודת כניסה מרכזית לכל הפונקציות של Instagram Graph API
 */

export {
  // Client functions
  sendInstagramDM,
  sendInstagramQuickReply,
  sendInstagramImage,
  sendLongInstagramDM,
  getUserProfile,
  getStoryInsights,
  getStories,
  verifyWebhookSignature,
  // Types
  type IGWebhookPayload,
  type IGWebhookEntry,
  type IGMessagingEvent,
  type IGChangeEvent,
  type IGSendMessageResponse,
  type IGUserProfile,
  type IGStoryInsight,
} from './client';

export {
  processInstagramGraphDM,
} from './dm-handler';
