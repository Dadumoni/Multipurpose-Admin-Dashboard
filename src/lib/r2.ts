import axios from 'axios';

export interface PresignedResponse {
  uploadUrl: string;
  publicUrl: string;
}

export async function getPresignedUrl(fileName: string, contentType: string, folder: string = ''): Promise<PresignedResponse> {
  const response = await axios.post('/api/upload/r2-presigned', {
    fileName,
    contentType,
    folder,
  });
  return response.data;
}

export async function uploadToR2(
  file: File, 
  folder: string = '', 
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const { uploadUrl, publicUrl } = await getPresignedUrl(file.name, file.type, folder);

  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
    signal,
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return publicUrl;
}

