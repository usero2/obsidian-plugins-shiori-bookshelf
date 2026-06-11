import { App, PluginSettingTab, Setting } from 'obsidian';
import ShioriBookshelfPlugin from './main';

export interface ShioriBookshelfSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: ShioriBookshelfSettings = {
	mySetting: 'default',
};

export class ShioriBookshelfSettingTab extends PluginSettingTab {
	plugin: ShioriBookshelfPlugin;

	constructor(app: App, plugin: ShioriBookshelfPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
