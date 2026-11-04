# 第三方组件说明

YOUKAI 项目作者：二百七。项目代码采用根目录 `LICENSE.txt` 中的 MIT 协议；第三方材料按各自许可保留署名。

| 材料 | 来源与署名 | 处理方式 |
| --- | --- | --- |
| Windows 安装器引擎 | Inno Setup；Jordan Russell、Martijn Laan 等 | 安装器内置版权信息保留，许可全文见 `licenses/INNO-SETUP-LICENSE.txt` |
| 安装器简体中文翻译 | 官方 Inno Setup 仓库内的 ChineseSimplified.isl；维护者 Zhenghan Yang（Kira） | 原始文件头、译者信息完整保留，不改署名 |
| Adobe 接口 | Illustrator / Photoshop / CEP / ExtendScript | 属于宿主产品及接口名称；不随包分发 Adobe 软件或完整 Adobe SDK |
| 开发检查工具 | Playwright、Node.js、Python | 不打入 EXE；本地开发环境另行安装，遵循各自许可 |

中文翻译下载自 [Inno Setup 官方仓库](https://github.com/jrsoftware/issrc/blob/main/Files/Languages/ChineseSimplified.isl)，获取日期为 2026-10-15。发布快照中保留具体文件及 SHA256，避免后续上游变化影响追溯。

`CSInterface.js` 是当前项目已有的精简 CEP 适配代码，并非完整 SDK。代码审阅未发现额外的第三方许可头；这不能替代原始来源确认。以后公开前，作者仍需确认整理导入脚本、图标和其他素材的来源及授权。

文档中的参考链接、接口名称、第三方许可和译者署名属于必要来源信息，不作为业务代码中的个人推广信息清除。
