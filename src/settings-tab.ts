import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type DesktopHomePlugin from './main';
import { parseFolderList, type Theme } from './model';

interface Row { name: string; desc?: string; render: (setting: Setting) => void }
interface Section { heading: string; rows: Row[] }

/** 插件设置：基础 / 日记 / 高级 三组。首页里的外观与组件仍在首页内调整。 */
export class DesktopSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: DesktopHomePlugin) { super(app, plugin); }
  private sections(): Section[] {
    const s = this.plugin.settings; const update = this.plugin.updateSettings.bind(this.plugin);
    const daily = this.plugin.dailyConfig();
    return [
      { heading: '基础', rows: [
        { name: '打开桌面首页', desc: '主题、壁纸与组件布局在首页右上角调整。', render: setting => { setting.addButton(b => b.setButtonText('打开').setCta().onClick(() => { void this.plugin.openHome(); })); } },
        { name: '启动时打开首页', desc: '每次启动 Obsidian 时自动打开桌面首页。', render: setting => { setting.addToggle(t => t.setValue(s.openOnStart).onChange(v => { void update({ openOnStart: v }); })); } },
        { name: '24 小时制', desc: '关闭后显示上午 / 下午。', render: setting => { setting.addToggle(t => t.setValue(s.clock24).onChange(v => { void update({ clock24: v }); })); } },
        { name: '主题', desc: '「自动」会跟随 Obsidian 的明暗模式，在晴空和午夜之间切换。', render: setting => { setting.addDropdown(d => d.addOptions({ auto: '自动', sky: '晴空', midnight: '午夜', paper: '暖纸' }).setValue(s.theme).onChange(v => { void update({ theme: v as Theme }); })); } },
      ] },
      { heading: '日记', rows: [
        { name: '跟随核心「日记」插件', desc: `开启后使用核心插件的文件夹、日期格式和模板（核心插件未启用时使用下方设置）。当前今日日记：${this.plugin.dailyPath(new Date(), daily)}`, render: setting => { setting.addToggle(t => t.setValue(s.dailyFollowCore).onChange(v => { void update({ dailyFollowCore: v }).then(() => this.redisplay()); })); } },
        { name: '日记文件夹', desc: '留空表示放在库的根目录。', render: setting => { setting.addText(t => t.setPlaceholder('日记').setValue(s.dailyFolder).onChange(v => { void update({ dailyFolder: v }); })); } },
        { name: '文件名格式', desc: '使用 Moment 日期格式，例如 YYYY-MM-DD。', render: setting => { setting.addText(t => t.setPlaceholder('YYYY-MM-DD').setValue(s.dailyFormat).onChange(v => { void update({ dailyFormat: v || 'YYYY-MM-DD' }); })); } },
      ] },
      { heading: '高级', rows: [
        { name: '搜索时忽略的文件夹', desc: '这些文件夹里的笔记不出现在搜索、最近笔记和待办中。每行一个，例如 模板。', render: setting => { setting.addTextArea(t => { t.setPlaceholder('模板\n附件').setValue(s.excludeFolders.join('\n')).onChange(v => { void update({ excludeFolders: parseFolderList(v) }); }); t.inputEl.rows = 3; }); } },
        { name: '天气', desc: s.city ? `当前城市：${s.city.name}。天气数据来自 Open-Meteo，只发送城市名或坐标，不发送笔记内容。` : '尚未启用。在首页的天气组件中选择城市后，才会连接 Open-Meteo。', render: setting => { if (s.city) setting.addButton(b => b.setButtonText('停用并清除城市').setWarning().onClick(() => { void update({ city: null, weatherCache: null }).then(() => this.redisplay()); })); } },
        { name: '数据与隐私', desc: '没有账户和统计。配置、便签和上传的壁纸保存在本库的插件 data.json 中，会随库同步。', render: () => {} },
      ] },
    ];
  }
  private redisplay() { this.display(); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map(section => ({ type: 'group' as const, heading: section.heading, items: section.rows.map(row => ({ name: row.name, desc: row.desc, render: (setting: Setting) => { setting.setName(row.name); if (row.desc) setting.setDesc(row.desc); row.render(setting); } })) }));
  }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    for (const section of this.sections()) {
      new Setting(containerEl).setName(section.heading).setHeading();
      for (const row of section.rows) { const setting = new Setting(containerEl).setName(row.name); if (row.desc) setting.setDesc(row.desc); row.render(setting); }
    }
  }
}
