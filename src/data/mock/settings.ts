/** MOCK settings — Step 1 only, disimpan di state lokal. */
export const MOCK_SETTINGS = {
  isMock: true,
  cityQuestion: "Kak, boleh tahu dari kota mana?",
  toggles: {
    saveName: true,
    saveWhatsapp: true,
    saveCity: true,
    saveTimestamp: true,
    autoDetectCity: false,
  },
} as const;

export type SettingsToggles = keyof typeof MOCK_SETTINGS.toggles;
