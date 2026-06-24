// Type shim for expo-file-system/legacy subpath (SDK 54)
declare module "expo-file-system/legacy" {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export const EncodingType: { Base64: 'base64'; UTF8: 'utf8' };
  export function getInfoAsync(fileUri: string, options?: object): Promise<{ exists: boolean; uri: string; size?: number; isDirectory?: boolean; modificationTime?: number; md5?: string }>;
  export function readAsStringAsync(fileUri: string, options?: object): Promise<string>;
  export function writeAsStringAsync(fileUri: string, contents: string, options?: object): Promise<void>;
  export function deleteAsync(fileUri: string, options?: object): Promise<void>;
  export function makeDirectoryAsync(fileUri: string, options?: object): Promise<void>;
  export function readDirectoryAsync(fileUri: string): Promise<string[]>;
}
