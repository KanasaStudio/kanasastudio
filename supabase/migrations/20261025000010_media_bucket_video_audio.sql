-- Allow hero video and sound-effect files in the public media bucket (max 40 MB).
update storage.buckets set file_size_limit = 41943040,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','model/gltf-binary','application/octet-stream',
    'video/mp4','video/webm','audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/mp4','audio/webm']
where id = 'public-media';
