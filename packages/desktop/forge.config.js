/**
 * Electron Forge Configuration
 */

export default {
  packagerConfig: {
    name: 'SideButton',
    executableName: 'sidebutton',
    icon: './assets/icon',
    appBundleId: 'com.sidebutton.desktop',
    // macOS code signing (requires environment variables)
    osxSign: process.env.APPLE_ID ? {} : undefined,
    osxNotarize: process.env.APPLE_ID ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    } : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'SideButton',
          homepage: 'https://github.com/maxsv0/sidebutton',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'maxsv0',
          name: 'sidebutton',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};
