export type PushEventName = 'gitChanged' | 'themeChanged' | 'folderChanged';

export interface PushEventPayloads {
  gitChanged: undefined;
  themeChanged: undefined;
  folderChanged: { folder: string };
}
