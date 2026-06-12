import {
	App,
	Modal,
	Plugin,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	ShioriBookshelfSettings,
	ShioriBookshelfSettingTab,
} from './settings';

export default class ShioriBookshelfPlugin extends Plugin {
	settings!: ShioriBookshelfSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ShioriBookshelfSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ShioriBookshelfSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ShioriBookshelfModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Shiori Bookshelf');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
