export type SiteEditLockInput = {
  status?: string | null;
  previewUrl?: string | null;
  siteZipUrl?: string | null;
};

const lockedStatuses = new Set(["client_preview", "standard_delivery_ready", "delivered", "archived"]);

export const SITE_CONTENT_EDIT_LOCKED_MESSAGE =
  "官网初稿已生成，文案和风格修改服务已关闭。如需额外调整，请联系客服处理。";

export function isSiteContentEditingLocked(siteJob: SiteEditLockInput) {
  return Boolean(siteJob.previewUrl || siteJob.siteZipUrl || (siteJob.status && lockedStatuses.has(siteJob.status)));
}
