# YOUKAI 1.0.0 正式版

作者：二百七。面向 Adobe Illustrator 的脚本工具箱，内置 26 个工具，提供简明说明、CSV 模板及批处理。

[下载安装包](https://github.com/erbaiqi-pro/YOUKAI/releases/latest) · [作者网站](https://erbaiqi.pages.dev/)

## 使用

1. 首次安装前保存工作并退出 Adobe 软件，运行 Windows 安装包。
2. 在 Illustrator 的“窗口 > 扩展”中打开 YOUKAI。
3. 在系统设置中选择 CSV 和输出目录。双击工具运行，点击“说明”查看步骤。

先用“集体注释”生成对象注释，再手填 CSV，通过“按注释批量修改”移动对象、改专色 T 值、改普通 CMYK 色值或删除。批处理跳过 link／links 文件夹；打包收集链接素材的功能保持原样。

“导出PDF”已从内置工具中移除。当前不调整分类，其余工具代码原样保留。9 个已验收内置脚本采用固定 SHA256 校验；被移除的 PDF 脚本只保留历史校验记录。

## 自愿更新

发现新版本时，网站 LOGO 旁显示红色 NEW；没有自动弹窗或强制更新。

- 1.0.x 的脚本更新：仅更新内置脚本、说明、模板和版本清单，保留路径设置、个人 CSV、自定义脚本和插件程序。
- 1.1.0、2.0.0 等大版本或需要新版插件程序的更新：显示官网下载入口，不在面板里替换程序。
- 测试版首次升级到此正式版：一次性同步升级更新器，保留现有路径设置；以后按上述规则更新。

对外版本为 **1.0.0 正式版**。为使数字更大的旧测试版也能识别更新，本次内部更新编号和 GitHub 标签为 **1.0.3 / v1.0.3**。历史测试标签不覆盖、不改写。

完整步骤与维护规则见 [联网更新](docs/联网更新.md)。

## 源码与验证

- `com.youkai.toolbox/`：插件、脚本、说明和模板。
- `installers/`：Windows 与 macOS 安装工具；Windows 使用 Inno Setup 6 编译。
- `tools/`：构建与检查工具。`npm test` 检查脚本及隔离目录内的更新事务；`npm run test:ui` 检查面板。
- `docs/`、`licenses/`：更新记录、校验记录、隐私说明及许可。

`python tools/build-release.py` 生成完整安装包和干净源码副本。`python tools/build-update.py` 默认生成仅含脚本及配套文件的更新包；程序升级使用 `--kind installer`。`--kind bootstrap` 仅允许本次测试版转正式版的兼容升级。

真实宿主编译可运行 `npm run test:host`，不运行或保存画稿处理脚本。实际输出仍需在设计文件副本上核对；macOS 尚未实机验收。

普通工具本地运行；更新不需要 API Key，不上传设计稿、对象注释或 CSV。发布前执行密钥筛查，详见 [隐私说明](docs/PRIVACY.md)。项目采用 [MIT](LICENSE.txt)，第三方许可见 [第三方说明](THIRD_PARTY_NOTICES.md)。
