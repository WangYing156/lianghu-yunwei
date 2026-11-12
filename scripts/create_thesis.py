"""
根据仓库实现情况生成/更新毕业论文 docx。
运行：python scripts/create_thesis.py
截图占位处可在替换为真实图片路径后再次运行本脚本（见 placeholder_figure 的 asset 参数）。
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/论文/两湖隧道智能运维管理平台设计与实现.docx'
OUT.parent.mkdir(parents=True, exist_ok=True)

d = Document()
sec = d.sections[0]
sec.top_margin = Inches(0.75)
sec.bottom_margin = Inches(0.75)
sec.left_margin = Inches(0.85)
sec.right_margin = Inches(0.85)

style = d.styles['Normal']
style.font.name = '宋体'
style._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
style.font.size = Pt(10.5)
for nm in ('Title', 'Heading 1', 'Heading 2', 'Heading 3'):
    s = d.styles[nm]
    s.font.name = '黑体'
    s._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    s.font.color.rgb = RGBColor(27, 57, 88)

FIG = 0
TAB = 0


def shade(cell: object, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement('w:shd')
    sh.set(qn('w:fill'), color)
    tc_pr.append(sh)


def para(text: str = '', *, bold: bool = False, center: bool = False, indent: bool = True):
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.JUSTIFY
    if indent and not center:
        p.paragraph_format.first_line_indent = Pt(21)
    r = p.add_run(text)
    r.bold = bold
    return p


def heading(t: str, level: int = 1) -> None:
    d.add_heading(t, level=level)


def next_fig() -> int:
    global FIG
    FIG += 1
    return FIG


def next_tab() -> int:
    global TAB
    TAB += 1
    return TAB


def table(headers: list[str], rows: list[list[str]], widths=None):
    t = d.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = h
        shade(c, '173A5E')
        for r in c.paragraphs[0].runs:
            r.font.color.rgb = RGBColor(255, 255, 255)
            r.bold = True
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = str(v)
            cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    return t


def figcaption(text: str) -> None:
    p = para(text, center=True)
    if p.runs:
        p.runs[0].italic = True


def diagram_caption(title: str, rows: list[list[str]], caption: str) -> None:
    n = next_tab()
    heading(f'表{n} {title}', 3)
    table(['层次/组成', '职责与实现'], rows)
    figcaption(f'表{n} {caption}')


def placeholder_figure(
    hint: str,
    caption: str,
    *,
    asset: str | None = None,
    width_in: float = 5.8,
) -> None:
    """asset 为相对仓库根目录的图片路径；为 None 时输出灰色占位框。"""
    n = next_fig()
    path = ROOT / asset if asset else None
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if path and path.is_file():
        p.add_run().add_picture(str(path), width=Inches(width_in))
    else:
        t = d.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        c = t.rows[0].cells[0]
        shade(c, 'E8EDF2')
        cp = c.paragraphs[0]
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = cp.add_run(
            f'【截图占位 · 图{n}】\n{hint}\n'
            f'建议 1920×1080 或 16:9，PNG/JPG；替换后在本脚本对应项设置 asset= 路径并重新运行。'
        )
        run.font.color.rgb = RGBColor(80, 96, 112)
    figcaption(f'图{n} {caption}')


# ── 封面 ──
p = d.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(56)
r = p.add_run('两湖隧道（南湖段）智能运维管理平台\n设计与实现')
r.bold = True
r.font.name = '黑体'
r._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
r.font.size = Pt(24)
r.font.color.rgb = RGBColor(23, 58, 94)
para('——基于 BIM 与 Cesium 的隧道三维可视化运维原型研究', center=True)
for _ in range(3):
    d.add_paragraph('')
for text in (
    '本科/项目设计论文（依据 lianghu-yunwei 代码仓库编写）',
    '作者：[请填写姓名]　　学号：[请填写]',
    '指导教师：[请填写]　　学院/专业：[请填写]',
    '完成时间：2026年11月',
):
    para(text, center=True)
para(
    '说明：正文描述可运行浏览器前端原型；工单、告警、视频等为演示数据，不代表生产系统已上线。',
    center=True,
)
d.add_page_break()

# ── 摘要 ──
heading('摘要', 1)
para(
    '城市隧道运维涉及多专业设备与多源信息，空间位置与业务台账若缺乏统一可视化入口，'
    '值班与检修人员难以在秒级内回答“设备在哪、告警对应哪一段、模型里能否直接看见”。'
    '针对两湖隧道（南湖段）智能运维管理平台的建设需求，本文设计并实现一套基于 Web 的三维运维可视化原型：'
    '以 Vue 3、TypeScript 与 Vite 构建七类业务视图，以 Cesium 承载全局施工 BIM 与局部竣工 BIM，'
    '在同一三维场景中完成图层编排、设备定位、剖切检视、基于路面几何的内部巡游、'
    '告警—点位联动及资产资料与模型构件的统一资料面板。'
)
para(
    '系统在工程上采用“表现层—场景协调层—领域功能层—数据资源层”的分层组织；'
    '在算法与交互上重点处理跨 Tileset 坐标系的剖切平面换算、屏幕空间聚合与近景图标滞回、'
    '从道路构件上表面采样的弧长推进巡游，以及数字应急模块中脚本化孪生工况推演与竣工段风机/气流可视化。'
    '仓库配备 28 项 Node 单元测试与 29 项浏览器场景回归脚本，覆盖路径、图层、剖切、聚合与巡游等关键行为。'
)
para(
    '需要强调的是：本文成果限于前端原型的交互可行性与工程可维护性论证；'
    '未接入实时物联网、生产级鉴权与视频流，亦未开展现场用户实验或运营效益量化。'
    '文中截图除仓库随附底图外，其余界面图以占位框标示，供定稿前补入真实运行截图。',
)
para('关键词：隧道智能运维；建筑信息模型；Cesium；三维可视化；设备定位；数字孪生推演', bold=True)
heading('Abstract', 1)
para(
    'This thesis documents the design and implementation of a browser-based intelligent '
    'operation and maintenance prototype for the Nanhu section of the Lianghu Tunnel. '
    'Vue 3, TypeScript, and Vite implement seven operational views around a shared Cesium scene '
    'that co-displays construction and partial as-built BIM tilesets. Core capabilities include '
    'cross-tileset sectioning, screen-space marker clustering with hysteresis, arc-length-based '
    'interior roaming sampled from roadway geometry, alert-to-location navigation, unified asset '
    'inspection panels, and scripted emergency twin scenarios with ventilation-related visual effects. '
    'Automated unit and browser smoke tests guard regressions in pathing, layers, materials, and interactions. '
    'The repository remains a front-end prototype with demonstration business data rather than a production O&M backend.',
)
para(
    'Keywords: tunnel O&M; BIM; Cesium; 3D visualization; equipment localization; twin simulation',
    bold=True,
)
d.add_page_break()

heading('目录', 1)
for x in (
    '1 绪论',
    '2 需求分析与总体设计',
    '3 系统关键技术与实现',
    '4 交互设计、算法与孪生推演',
    '5 测试验证与结果讨论',
    '6 局限、风险与后续工作',
    '7 结论',
    '参考文献',
    '附录A 主要程序模块索引',
    '附录B 待补充截图清单',
):
    para(x, indent=False)
d.add_page_break()

# ── 1 绪论 ──
heading('1 绪论', 1)
heading('1.1 研究背景与意义', 2)
para(
    '长大隧道机电与结构监测对象分布广、专业杂，传统以表格、平面图或分散视频监控为主的运维界面，'
    '难以把“事件—区段—构件”三者在同一空间上下文中呈现。建筑信息模型（BIM）以构件粒度保存几何与属性，'
    '三维地球/场景引擎（如 Cesium）则提供多尺度浏览、拾取与相机叙事能力。'
    '将二者结合用于运维检视，可降低“找设备、对位置”的认知成本，为值班演示、方案沟通和验收走查提供直观入口。'
)
para(
    '需要区分的是：三维前端本身并不自动构成完整智慧运维系统；'
    '数据治理、告警规则、工单闭环与安全审计仍依赖后端与现场流程。'
    '因此本课题选取“可运行原型”路线，在真实 BIM 几何约束下验证交互与架构，'
    '并对演示型业务数据明确标注边界，避免将界面效果外推为生产成效。',
)
n = next_fig()
p = d.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.add_run().add_picture(str(ROOT / 'public/scene-map.jpg'), width=Inches(6.0))
figcaption(f'图{n} 项目随附隧道区域示意底图（public/scene-map.jpg；正式论文中可替换为现场或正射影像截图并注明来源）')

heading('1.2 国内外相关研究与实践', 2)
para(
    '在交通基础设施信息化方向，国内外工程实践普遍经历从二维 GIS 资产台账、到 BIM+GIS 融合、'
    '再到运维期数字孪生演示的发展路径。学术研究多关注模型轻量发布（3D Tiles）、'
    '多源坐标统一、语义化设备关联及大屏可视化的人机因素；'
    '行业规范方面，ISO 19650 系列强调信息管理角色与交付边界，'
    '对运维阶段“模型—台账—现场”一致性提出流程要求。'
)
para(
    'Cesium 与 3D Tiles 已成为 Web 端大规模几何流式加载的事实标准之一；'
    'Vue 3 组合式 API 有利于将场景逻辑沉淀为可测 composable。'
    '现有公开案例常侧重展示，而对剖切跨原点、真实构件拾取、聚合与巡游路径校准等工程细节着墨较少。'
    '本文以开源可复现仓库为对象，把这些细节作为设计与验证重点。',
)

heading('1.3 研究目标、内容与范围', 2)
para(
    '目标：实现可浏览、可检索、可定位、可剖切、可巡游的隧道三维运维前端，'
    '并以多业务模块验证“单场景、多视图”组织方式。'
    '内容：需求与架构、BIM 场景与设备目录、剖切与材质策略、巡游与告警联动、'
    '数字应急孪生推演、测试与局限讨论。'
    '范围：仅包含仓库内前端、随附模型与自动化脚本；不含物联网接入、算法精度评估与经济效益量化。',
)

heading('1.4 研究方法与技术路线', 2)
para(
    '采用“需求梳理—模块化设计—原型实现—自动化验证”的螺旋路径：'
    '从交付说明与源码归纳功能与非功能需求；划分场景 composable 与配置层；'
    '以单元测试锁定纯函数与路径逻辑，以 Playwright 场景脚本锁定浏览器交互；'
    '论文叙述与代码提交同步，避免文档与实现脱节。',
)
placeholder_figure(
    '系统技术路线示意：需求 → 架构分层 → Cesium 场景 → 七模块联调 → 测试',
    '技术路线总览（建议用 PPT/ProcessOn 导出流程图替换本占位）',
)

# ── 2 需求与总体设计 ──
heading('2 需求分析与总体设计', 1)
heading('2.1 功能性需求', 2)
table(
    ['编号', '需求描述', '验收口径（原型）'],
    [
        ('F1', '施工/竣工模型同屏展示与快捷切换', '默认施工半透明全局示意，可切换竣工段'),
        ('F2', '138 个可独立定位竣工构件图标', '目录来自 scenetree，禁止虚构合并灯具坐标'),
        ('F3', '图层按业务模块默认开关', 'scenePoints 配置，换页可恢复默认'),
        ('F4', '剖切 X/Y/水平Z，可选目标模型', '世界平面换算至各 Tileset 局部系'),
        ('F5', '内部巡游沿真实路面采样', '27 点/层，弧长时间推进'),
        ('F6', '告警/监控联动定位', '稳定 pointId，图层关闭时自动开启'),
        ('F7', '孪生应急工况推演', '四工况脚本 + 场景 HUD + 巡游联动'),
        ('F8', '资产列表与场景构件资料同步', '同一资料面板，名称映射'),
    ],
)

heading('2.2 非功能性需求', 2)
table(
    ['类别', '要求', '实现要点'],
    [
        ('性能', '首屏尽快可交互', '延后倾斜摄影、限制并发瓦片请求、按需渲染'),
        ('可用性', '键盘与减动效', 'resize 把手可键盘操作；prefers-reduced-motion'),
        ('可维护', '逻辑可单测', '路径/剖切/孪生脚本纯函数化'),
        ('诚实标注', '演示数据边界', '模拟事件、模拟视频画面明确文案'),
    ],
)

heading('2.3 系统总体架构', 2)
diagram_caption(
    '系统逻辑分层',
    [
        ('表现层', 'Vue 路由页面、业务卡片、TwinSimHud、VideoPreviewDialog'),
        ('场景协调层', 'useCesiumTunnelMap：Viewer 生命周期、模型、相机、拾取'),
        ('领域功能层', '标记聚合、剖切、巡游、材质、孪生仿真、告警轮播'),
        ('数据资源层', 'Tileset/GLB、scenePoints、alerts、twinScenarios、静态媒体'),
    ],
    '各层通过稳定 ID 与一次性导航请求协作，避免页面切换重复创建场景。',
)
placeholder_figure(
    '总览页（#/overview）：三维场景 + 左右业务卡片 + 底部 Dock',
    '总览大屏运行效果',
    asset=None,
)

heading('2.4 功能模块与场景关系', 2)
table(
    ['模块', '路由', '默认图层侧重', '场景联动'],
    [
        ('总览', '#/overview', '全部', '告警、监控定位'),
        ('智能交通', '#/traffic', '环境、交通管控', '视频示例点位'),
        ('智慧养护', '#/maintenance', '环境、结构监测', '病害点'),
        ('智慧监测', '#/monitoring', '环境、环控、结构', '监测点曲线'),
        ('数字应急', '#/emergency', '环境、环控、机电', '孪生推演、巡游'),
        ('数字服务', '#/service', '环境', '投诉点'),
        ('资产资料中心', '#/asset', '全部', '树—场景—资料面板'),
    ],
)

# ── 3 关键技术 ──
heading('3 系统关键技术与实现', 1)
heading('3.1 技术选型', 2)
table(
    ['技术', '版本/说明', '选用理由'],
    [
        ('Vue 3 + TS', '3.4 / 5.4', '组合式 API 便于抽取 useXxx 场景逻辑'),
        ('Vite', '5.x', '快速开发与按需打包'),
        ('Cesium', '1.146', '3D Tiles、拾取、相机与后期处理'),
        ('Element Plus', '2.7', '大屏表单与开关组件'),
        ('ECharts', '5.5', '业务页统计图'),
        ('tsx test + Playwright', '—', '单元与浏览器分层验证'),
    ],
)

heading('3.2 BIM 发布与坐标处理', 2)
para(
    '全局施工模型与局部竣工模型以 3D Tiles（含 GLB 瓦片）形式部署于 public/三维数据。'
    '二者局部原点不一致，剖切与拾取必须在世界坐标语义下统一，再乘以各 tileset.root.computedTransform 的逆变换。'
    '施工模型默认采用半透明 CustomShader 提示空间关系；竣工路面默认保留 GLB 原始 PBR，'
    '仅在用户显式开启“路面透视”时调整透明度，防止施工透明策略污染道路材质。',
)
placeholder_figure(
    '剖切工具：青色切割面 + 竣工段目标 + 扫入动画',
    '模型剖切效果',
)

heading('3.3 设备目录、聚合与远近可见性', 2)
para(
    'useSceneMarkers 从竣工 scenetree 解析可独立定位构件（当前 138 项），'
    '图标位置取包围球中心经变换后的世界坐标。远景按屏幕像素距离聚合（阈值约 46px），'
    '点击聚合数字放大并列出成员；告警与当前选中设备处于优先层，不参与普通聚合。'
    '进入设备约 45m 内隐藏 BIM 图标，退至 65m 外恢复，滞回抑制临界闪烁；'
    '内部巡游与二维模式隐藏外部图标，聚焦模型本体。',
)
placeholder_figure(
    '聚合数字展开列表 + 设备高亮（暖橙色 Fresnel）',
    '点位聚合与构件定位',
)

heading('3.4 基于路面几何的内部巡游', 2)
para(
    '巡游路线非示意折线，而从 NoLod_7.glb 中道路构件（malu）上表面采样，'
    '上下层各 27 点，经 calibrate-roaming-route 脚本写回 partialRoamingRoutes.ts。'
    '播放按弧长与时间推进；支持末端入场、反向、速度档位与设备检索。'
    '退出巡游恢复剖切、图层与侧栏状态，并在页面卸载时注销监听与相机回调，防止 WebGL 资源泄漏。',
)
placeholder_figure(
    'ModelRoamingPanel：层切换、进度、设备搜索',
    '竣工模型内部巡游界面',
)

heading('3.5 数字应急孪生推演与通风可视化', 2)
para(
    '数字应急模块将“孪生 VR”定义为页面内脚本化推演，而非头显程序。'
    'twinScenarios.ts 以纯数据描述火灾疏散、积水排涝、交通事故、日常巡检四类工况：'
    '每类包含步骤时长、路线 progress 锚点、遥测插值函数与联动设备表。'
    'useTwinSimulation 驱动步骤播放、速率与视角模式；TwinSimHud 叠加于 TunnelScene。'
    'usePartialTunnelFx 在竣工段实现风机叶轮绕真实轴心旋转、射流羽流与车道风向，'
    '日常/排烟/停机模式可由 UI 或孪生脚本 override。工况切换可联动上方 Cesium 内部巡游路径。',
)
placeholder_figure(
    'Emergency 页：工况卡片 + 步骤轴 +「联动三维巡游」',
    '数字应急孪生推演面板',
)

heading('3.6 首屏加载与渲染策略', 2)
para(
    '总览页将 Cesium 与 ECharts 延后挂载；场景优先加载竣工/施工 Tileset 并飞向隧道，'
    '倾斜摄影（若存在）延迟约 0.7s 且限制每服务器并发请求。'
    '首屏关闭 MSAA/SSAO 并启用 requestRenderMode，减少空转帧消耗。'
    '该策略以可接受的首屏交互时延换取完整功能，生产部署仍需按显卡与模型体量实测调参。',
)

heading('3.7 业务演示数据与真实模型边界', 2)
para(
    'alerts.ts 中五条模拟告警使用稳定 pointId，与横幅、面板、地图标记一致。'
    '视频与 GIF 为示例媒体，窗口标注“模拟画面”。'
    '资产资料中心对未建档构件展示 BIM 属性而非虚构台账。'
    '论文与界面均不得将演示数字表述为实时生产指标。',
)

# ── 4 交互与算法 ──
heading('4 交互设计、算法与孪生推演', 1)
heading('4.1 剖切状态机', 2)
para(
    '剖切启用时可选择目标（全部/竣工/施工），轴系切换带扫入动画。'
    '二维视图与巡游中冻结剖切平面更新；返回三维恢复；destroy 时释放 clipping collection。'
)

heading('4.2 聚合与定位算法要点', 2)
para(
    '聚合在屏幕空间完成，避免地理距离在不同纬度下的失真；'
    '点击成员后临时解散局部聚合并二次拉近，保证“看见模型”而不仅是看见图标。'
    'sceneFocusRequest 通过 consume 模式传递一次性定位命令，防止路由切换重放旧焦点。',
)

heading('4.3 孪生遥测插值', 2)
para(
    'piecewise(segments, step, k) 在每个推演步骤内对遥测标量线性插值，'
    'level() 按阈值映射 ok/warn/alarm，用于 HUD 进度条与设备列表配色。'
    '该设计便于 twinFx.test.ts 对纯函数回归，而不依赖完整 Cesium 运行时。',
)

diagram_caption(
    '典型空间交互链路',
    [
        ('输入', '告警/设备/聚合成员/检索框'),
        ('解析', 'pointId 或 BIM 目录项'),
        ('协调', '图层、二维/巡游/孪生状态'),
        ('反馈', '相机、高亮、弹窗、聚合展开'),
    ],
    '强调对象身份一致性，而非孤立动画。',
)

# ── 5 测试 ──
heading('5 测试验证与结果讨论', 1)
heading('5.1 测试分层', 2)
table(
    ['层次', '命令', '覆盖范围'],
    [
        ('静态检查', 'npm run typecheck', 'Vue/TS 类型'),
        ('单元测试', 'npm test（28 项）', '路径、图层、材质、剖切、孪生函数等'),
        ('构建', 'npm run build', '生产包体积与编译'),
        ('场景回归', 'npm run test:scene（29 项）', '浏览器真实交互，报告见 scene-interactions-qa.md'),
    ],
)
para(
    '本文不捏造未在本次环境执行的通过率数据。复现时应在 README 所述 Node 22、Chrome/WebGL2 环境下'
    '保存终端输出与 .build-check 截图，以支撑论文“可复现”表述。',
)
placeholder_figure(
    '终端中 npm test / test:scene 通过摘要',
    '自动化测试结果摘录',
)

heading('5.2 结果讨论', 2)
para(
    '结合源码与测试用例可确认：共享场景支撑七模块切换；剖切跨坐标系行为有单测约束；'
    '巡游路径与孪生脚本可独立验证；告警定位在图层关闭时能自动开启目标分组。'
    '上述结论属于实现正确性范畴；用户效率、误操作率与现场网络条件下的帧率仍需专门实验。',
)

# ── 6 局限 ──
heading('6 局限、风险与后续工作', 1)
heading('6.1 当前局限', 2)
para(
    '（1）无生产后端、鉴权与审计；（2）业务数据静态；（3）BIM 为局部竣工段；'
    '（4）倾斜摄影与天地图依赖外部部署；（5）孪生推演为教育演示脚本，非物理仿真；'
    '（6）论文界面截图尚未全部替换占位图。',
)

heading('6.2 后续工作', 2)
para(
    '接入经授权的设备台账与告警/视频 API；建立模型版本—目录自动 diff；'
    '对孪生脚本与 CFD/通风仿真的耦合方式进行可行性研究；'
    '开展任务导向可用性测试并记录定位耗时与错误恢复路径；'
    '生产化部署补充 HTTPS、权限、限流与监控。',
)
placeholder_figure(
    '资产资料中心：左侧树 + 右侧资料面板 + 场景高亮',
    '资产资料与三维联动',
)

# ── 7 结论 ──
heading('7 结论', 1)
para(
    '本文围绕两湖隧道（南湖段）智能运维管理平台，完成了从需求、分层架构到关键交互的实现说明，'
    '并在真实 BIM 约束下验证了设备目录定位、跨模型剖切、路面采样巡游、告警联动、'
    '孪生工况推演与通风可视化等能力。配套测试为可复现验证提供了路径。'
    '成果表明：以 Cesium+BIM 构建隧道运维三维入口在工程上可行，但生产价值仍取决于数据接入与流程闭环。'
    '定稿前需将占位截图替换为真实运行图，并按学校格式补全封面、致谢与原创性声明。',
)

heading('参考文献', 1)
refs = [
    '[1] Cesium. CesiumJS Documentation[EB/OL]. https://cesium.com/learn/cesiumjs/ref-doc/（2026-11-12）.',
    '[2] Open Geospatial Consortium. OGC 3D Tiles Specification, Version 1.1[EB/OL]. https://docs.ogc.org/cs/22-025r4/22-025r4.html（2026-11-12）.',
    '[3] Vue.js. Vue.js Guide[EB/OL]. https://vuejs.org/guide/introduction.html（2026-11-12）.',
    '[4] ISO. ISO 19650-1:2018. Information management using BIM[S]. Geneva: ISO, 2018.',
    '[5] W3C. Web Content Accessibility Guidelines (WCAG) 2.2[EB/OL]. https://www.w3.org/TR/WCAG22/（2026-11-12）.',
    '[6] 王建民, 等. 建筑信息模型（BIM）技术应用现状与发展趋势[J]. 土木建筑工程信息技术, 相关综述文献—提交时请按学校要求补全卷期页.',
    '[7] Wang Ying. lianghu-yunwei repository[CP/OL]. GitHub, 2026. https://github.com/WangYing156/lianghu-yunwei（2026-11-12）.',
]
for x in refs:
    para(x, indent=False)

d.add_page_break()
heading('附录A 主要程序模块索引', 1)
table(
    ['路径', '职责'],
    [
        ('src/components/TunnelScene.vue', '场景容器、Dock、孪生 HUD 挂载'),
        ('src/composables/useCesiumTunnelMap.ts', '模型加载、相机、拾取'),
        ('src/composables/useSceneMarkers.ts', '构件图标与聚合'),
        ('src/composables/useModelSection.ts', '剖切'),
        ('src/composables/useModelRoaming.ts', '巡游'),
        ('src/composables/useTwinSimulation.ts', '孪生推演状态机'),
        ('src/composables/usePartialTunnelFx.ts', '风机与气流特效'),
        ('src/config/twinScenarios.ts', '工况脚本数据'),
        ('tests/*.test.ts', '单元测试'),
        ('scripts/smoke-scene.mjs', '浏览器场景回归'),
    ],
)

heading('附录B 待补充截图清单', 1)
table(
    ['图号', '建议页面/操作', '文件名建议'],
    [
        ('总览', '#/overview 默认视角', 'fig-overview.png'),
        ('剖切', '竣工段 Y 轴剖切', 'fig-section.png'),
        ('聚合', '远景聚合展开', 'fig-cluster.png'),
        ('巡游', '下层巡游中', 'fig-roaming.png'),
        ('孪生', '火灾工况步骤 2', 'fig-twin-fire.png'),
        ('资产', '风机资料面板', 'fig-asset.png'),
        ('测试', 'npm test 通过', 'fig-test.png'),
    ],
)
para(
    '将图片置于 docs/论文/images/ 后，可在 placeholder_figure(..., asset="docs/论文/images/xxx.png") 中引用并重新运行本脚本。',
)

heading('写作与诚信说明', 1)
para(
    '正文依据本仓库源码与交付文档归纳，未抄袭外部论文段落；'
    '功能描述与测试数字以 README 与 tests 为准；'
    '查重率取决于检测系统与学校规则，提交前请按学院模板统一页眉、行距与参考文献格式。',
)

for s in d.sections:
    h = s.header.paragraphs[0]
    h.text = '两湖隧道（南湖段）智能运维管理平台｜设计与实现'
    h.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    f = s.footer.paragraphs[0]
    f.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), 'PAGE')
    f._p.append(fld)

d.save(OUT)
print(f'Wrote {OUT}')
