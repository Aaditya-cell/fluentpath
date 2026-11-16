import { handleFeedback } from '../lib/feedback.js';
import { sendJson } from '../lib/http.js';

export default async function feedback(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow','POST');
    return sendJson(response,405,{error:'The feedback endpoint accepts POST requests only.'});
  }
  return handleFeedback(request,response);
}
