import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export interface PickedMemberPhoto {
  uri: string;
}

/**
 * Registration Photo step (docs/phase-1/14-reception-membership.md §14.5):
 * "Take Photo" and "Choose from Gallery" both go through the same crop
 * (native `allowsEditing`, square) + compress (resized + re-encoded here)
 * pipeline, so what gets uploaded is always a small, consistent square
 * JPEG regardless of source.
 */
const MAX_DIMENSION_PX = 800;
const JPEG_COMPRESSION = 0.6;

async function compress(uri: string): Promise<PickedMemberPhoto> {
  const result = await manipulateAsync(uri, [{ resize: { width: MAX_DIMENSION_PX } }], {
    compress: JPEG_COMPRESSION,
    format: SaveFormat.JPEG,
  });
  return { uri: result.uri };
}

export async function pickMemberPhotoFromCamera(): Promise<PickedMemberPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;

  return compress(result.assets[0].uri);
}

export async function pickMemberPhotoFromGallery(): Promise<PickedMemberPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;

  return compress(result.assets[0].uri);
}

/** Local `file://` URIs aren't directly uploadable to Supabase Storage — read into bytes first. */
export async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}
