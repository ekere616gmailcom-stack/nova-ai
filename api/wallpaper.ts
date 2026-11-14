import { handleWallpaper, type ApiRequest, type ApiResponse } from '../geminiHandlers';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleWallpaper(req, res);
}
