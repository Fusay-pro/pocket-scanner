export type Lang = 'en' | 'th';

const translations = {
  en: {
    // Tab bar
    tabProducts:  'Products',
    tabSell:      'Sell',
    tabAnalytics: 'Analytics',
    tabSettings:  'Settings',
    // Settings page
    settingsTitle:             'Settings',
    sectionLanguage:           'Language',
    sectionAppearance:         'Appearance',
    sectionAnalytics:          'Analytics',
    sectionInventory:          'Inventory',
    lowStockThresholdLabel:    'Low stock threshold (store-wide default)',
    sectionDanger:             'Danger Zone',
    langEnglish:               'English',
    langThai:                  'ภาษาไทย',
    themeLight:                'Light',
    themeDark:                 'Dark',
    analyticsDefaultRange:     'Default date range',
    range7d:                   '7 Days',
    range30d:                  '30 Days',
    rangeAll:                  'All Time',
    deleteAllProducts:         'Delete All Products',
    deleteAllProductsDesc:     'Permanently remove all products in this store. This cannot be undone.',
    deleteAllProductsConfirm:  'Type DELETE to confirm',
    deleteAllProductsBtn:      'Delete All Products',
    deleting:                  'Deleting…',
    deleted:                   'All products deleted.',
    ownerOnly:                 'Owner only',
  },
  th: {
    tabProducts:  'สินค้า',
    tabSell:      'ขาย',
    tabAnalytics: 'วิเคราะห์',
    tabSettings:  'ตั้งค่า',
    settingsTitle:             'ตั้งค่า',
    sectionLanguage:           'ภาษา',
    sectionAppearance:         'ธีม',
    sectionAnalytics:          'การวิเคราะห์',
    sectionInventory:          'คลังสินค้า',
    lowStockThresholdLabel:    'เกณฑ์สต็อกต่ำ (ค่าเริ่มต้นของร้าน)',
    sectionDanger:             'โซนอันตราย',
    langEnglish:               'English',
    langThai:                  'ภาษาไทย',
    themeLight:                'สว่าง',
    themeDark:                 'มืด',
    analyticsDefaultRange:     'ช่วงเวลาเริ่มต้น',
    range7d:                   '7 วัน',
    range30d:                  '30 วัน',
    rangeAll:                  'ทั้งหมด',
    deleteAllProducts:         'ลบสินค้าทั้งหมด',
    deleteAllProductsDesc:     'ลบสินค้าทั้งหมดออกจากร้านนี้อย่างถาวร ไม่สามารถเรียกคืนได้',
    deleteAllProductsConfirm:  'พิมพ์ DELETE เพื่อยืนยัน',
    deleteAllProductsBtn:      'ลบสินค้าทั้งหมด',
    deleting:                  'กำลังลบ…',
    deleted:                   'ลบสินค้าทั้งหมดแล้ว',
    ownerOnly:                 'เจ้าของเท่านั้น',
  },
} as const;

export type TKey = keyof typeof translations['en'];

export function t(lang: Lang, key: TKey): string {
  return (translations[lang] as Record<string, string>)[key]
    ?? (translations['en'] as Record<string, string>)[key]
    ?? key;
}
