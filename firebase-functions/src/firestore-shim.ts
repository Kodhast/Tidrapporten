// The functions read documents with the app's codecs (src/data/dokument.ts), which import the
// web SDK's `firebase/firestore` for its Timestamp. The functions have only the Admin SDK, so the
// bundle (vite.functions.config.ts) points that import here: the Admin SDK's Timestamp, which the
// documents read on the server are made of, and its server time.
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export { Timestamp };
export const serverTimestamp = () => FieldValue.serverTimestamp();
