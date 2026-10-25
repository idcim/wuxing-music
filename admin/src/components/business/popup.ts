/** 明确列出工具类，让 Tailwind 在生产构建时也能扫描到所有弹窗尺寸。 */
export const popupWidths: Record<string, string> = {
  '400px': 'w-[400px]', '440px': 'w-[440px]', '460px': 'w-[460px]',
  '480px': 'w-[480px]', '520px': 'w-[520px]', '560px': 'w-[560px]',
  '600px': 'w-[600px]', '640px': 'w-[640px]', '720px': 'w-[720px]',
  '60%': 'w-[60vw]',
};
