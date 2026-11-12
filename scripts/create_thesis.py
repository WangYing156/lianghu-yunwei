"""
按《基于数字孪生技术的CIM平台在城市精细化治理中的应用与实践》的字体、字号、
页边距和行距生成两湖隧道论文。

版式对照：
- A4，上/下 2.54 cm，左/右 3.17 cm
- 题目：宋体小二（18 磅）加粗，1.5 倍行距，居中
- 摘要、关键词、一级标题、二级标题、正文：宋体四号（14 磅）
- 摘要行距最小值 24 磅；关键词与正文行距固定值 24 磅
- 正文首行缩进 2 字符；一级标题段前段后 15.6 磅
- 图题、表题：宋体四号居中；表格内文宋体五号

运行：python scripts/create_thesis.py
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/论文/两湖隧道智能运维管理平台设计与实现.docx"
IMG = ROOT / "docs/论文/images"
OUT.parent.mkdir(parents=True, exist_ok=True)
IMG.mkdir(parents=True, exist_ok=True)

SONG = "宋体"
BLACK = RGBColor(0, 0, 0)
FIG = 0
TAB = 0


def _rfonts(run, east: str, ascii_font: str) -> None:
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), ascii_font)
    rfonts.set(qn("w:hAnsi"), ascii_font)
    rfonts.set(qn("w:eastAsia"), east)
    rfonts.set(qn("w:cs"), "Times New Roman")


def paint(run, size: float, *, bold: bool | None = False, east: str = SONG, ascii_font: str = SONG) -> None:
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = False
    run.font.color.rgb = BLACK
    run.font.name = ascii_font
    _rfonts(run, east, ascii_font)


def _spacing(p, *, before: int, after: int, line: int | None, rule: str | None) -> None:
    ppr = p._p.get_or_add_pPr()
    spacing = ppr.find(qn("w:spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing")
        ppr.append(spacing)
    spacing.set(qn("w:before"), str(before))
    spacing.set(qn("w:after"), str(after))
    if line is None:
        if qn("w:line") in spacing.attrib:
            del spacing.attrib[qn("w:line")]
        if qn("w:lineRule") in spacing.attrib:
            del spacing.attrib[qn("w:lineRule")]
    else:
        spacing.set(qn("w:line"), str(line))
        spacing.set(qn("w:lineRule"), rule or "exact")


def _indent(p, first: int) -> None:
    ppr = p._p.get_or_add_pPr()
    ind = ppr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        ppr.append(ind)
    if first <= 0:
        ind.set(qn("w:firstLine"), "0")
        ind.set(qn("w:firstLineChars"), "0")
    else:
        ind.set(qn("w:firstLine"), str(first))
        ind.set(qn("w:firstLineChars"), "200")


def add_p(
    *,
    align=WD_ALIGN_PARAGRAPH.LEFT,
    before: int = 0,
    after: int = 0,
    line: int | None = 480,
    rule: str | None = "exact",
    first: int = 0,
):
    p = d.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Twips(before)
    p.paragraph_format.space_after = Twips(after)
    _spacing(p, before=before, after=after, line=line, rule=rule)
    _indent(p, first)
    return p


def run(p, text: str, size: float, *, bold: bool | None = False) -> None:
    r = p.add_run(text)
    paint(r, size, bold=bold)
    return r


def title(text: str) -> None:
    p = add_p(align=WD_ALIGN_PARAGRAPH.CENTER, line=360, rule="auto")
    run(p, text, 18, bold=True)


def abstract(text: str) -> None:
    p = add_p(line=480, rule="atLeast")
    run(p, "[摘要]", 14, bold=True)
    run(p, " " + text, 14, bold=False)


def keywords(text: str) -> None:
    p = add_p(line=480, rule="exact")
    run(p, "[关键词] ", 14, bold=True)
    run(p, text, 14, bold=False)


def h1(text: str) -> None:
    p = add_p(before=312, after=312, line=480, rule="exact")
    run(p, text, 14, bold=True)


def h2(text: str) -> None:
    p = add_p(line=480, rule="exact")
    run(p, text, 14, bold=True)


def body(text: str) -> None:
    p = add_p(first=560, line=480, rule="exact")
    run(p, text, 14, bold=False)


def lead(label: str, text: str) -> None:
    p = add_p(line=480, rule="exact")
    run(p, label, 14, bold=True)
    run(p, text, 14, bold=False)


def caption(text: str) -> None:
    p = add_p(align=WD_ALIGN_PARAGRAPH.CENTER, line=480, rule="exact")
    run(p, text, 14, bold=False)


def shade(cell, color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:fill"), color)
    sh.set(qn("w:val"), "clear")
    tc_pr.append(sh)


def add_table(title_text: str, headers: list[str], rows: list[list[str]]) -> None:
    global TAB
    TAB += 1
    caption(f"表 {TAB} {title_text}")
    t = d.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = True
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _indent(p, 0)
        _spacing(p, before=40, after=40, line=240, rule="auto")
        run(p, h, 10.5, bold=True)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(cell, "F2F2F2")
    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            cell = t.rows[r_i + 1].cells[c_i]
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            _indent(p, 0)
            _spacing(p, before=40, after=40, line=240, rule="auto")
            run(p, val, 10.5, bold=False)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    gap = add_p(line=120, rule="exact")
    run(gap, "", 14)


def figure(asset: str, text: str, width_in: float = 5.5) -> None:
    global FIG
    FIG += 1
    path = IMG / asset
    if not path.is_file():
        raise FileNotFoundError(path)
    p = add_p(align=WD_ALIGN_PARAGRAPH.CENTER, line=None, rule=None)
    pic = p.add_run()
    pic.add_picture(str(path), width=Inches(width_in))
    caption(f"图 {FIG} {text}")


def _font(size: int):
    from PIL import ImageFont

    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "simsun.ttc"):
        path = Path(r"C:\Windows\Fonts") / name
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    from PIL import ImageFont as F

    return F.load_default()


def draw_boxes(path: Path, title_text: str, boxes: list[tuple[str, str]]) -> None:
    from PIL import Image, ImageDraw

    w, h = 1400, 420
    im = Image.new("RGB", (w, h), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    dr.rectangle((8, 8, w - 8, h - 8), outline=(0, 0, 0), width=2)
    dr.text((40, 28), title_text, fill=(0, 0, 0), font=_font(28))
    n = len(boxes)
    gap = 36
    bw = (w - 80 - gap * (n - 1)) // n
    bh = 230
    y0 = 110
    for i, (head, body_text) in enumerate(boxes):
        x0 = 40 + i * (bw + gap)
        dr.rectangle((x0, y0, x0 + bw, y0 + bh), outline=(0, 0, 0), width=2)
        dr.rectangle((x0, y0, x0 + bw, y0 + 48), fill=(0, 0, 0))
        dr.text((x0 + 16, y0 + 10), head, fill=(255, 255, 255), font=_font(22))
        line = ""
        yy = y0 + 64
        font = _font(18)
        for ch in body_text:
            trial = line + ch
            if dr.textlength(trial, font=font) > bw - 32:
                dr.text((x0 + 16, yy), line, fill=(0, 0, 0), font=font)
                yy += 28
                line = ch
            else:
                line = trial
        if line:
            dr.text((x0 + 16, yy), line, fill=(0, 0, 0), font=font)
        if i < n - 1:
            ax = x0 + bw + 6
            mid = y0 + bh // 2
            dr.line((ax, mid, ax + gap - 14, mid), fill=(0, 0, 0), width=2)
            dr.polygon([(ax + gap - 18, mid - 7), (ax + gap - 6, mid), (ax + gap - 18, mid + 7)], fill=(0, 0, 0))
    im.save(path)


draw_boxes(
    IMG / "fig-architecture.png",
    "系统逻辑分层",
    [
        ("表现层", "七个业务页面、告警与资料面板、巡游与孪生控制"),
        ("场景协调层", "Cesium 生命周期、相机、模型图层与拾取"),
        ("领域功能层", "聚合、剖切、巡游、材质、通风与工况推演"),
        ("数据资源层", "施工与竣工模型、设备目录、监测与应急数据"),
    ],
)
draw_boxes(
    IMG / "fig-flow.png",
    "空间交互链路",
    [
        ("用户输入", "告警、设备、聚合成员或名称检索"),
        ("对象解析", "稳定点位标识或竣工构件目录"),
        ("状态协调", "图层、视图模式与巡游状态"),
        ("空间反馈", "相机定位、构件高亮与资料展示"),
    ],
)

d = Document()
sec = d.sections[0]
sec.page_width = Twips(11906)
sec.page_height = Twips(16838)
sec.top_margin = Twips(1440)
sec.bottom_margin = Twips(1440)
sec.left_margin = Twips(1800)
sec.right_margin = Twips(1800)
sec.header_distance = Twips(851)
sec.footer_distance = Twips(992)
grid = OxmlElement("w:docGrid")
grid.set(qn("w:type"), "lines")
grid.set(qn("w:linePitch"), "312")
sec._sectPr.append(grid)

normal = d.styles["Normal"]
normal.font.size = Pt(14)
normal.font.name = SONG
normal.font.color.rgb = BLACK
normal._element.rPr.rFonts.set(qn("w:eastAsia"), SONG)
normal._element.rPr.rFonts.set(qn("w:ascii"), SONG)
normal._element.rPr.rFonts.set(qn("w:hAnsi"), SONG)

title("两湖隧道（南湖段）智能运维管理平台设计与实现")
abstract(
    "隧道机电、结构与交通设施沿里程分布，运维人员需要在同一界面中同时确认设备位置、所属区段和业务状态。"
    "本文设计并实现两湖隧道（南湖段）智能运维管理平台。平台以 Vue 3 与 TypeScript 组织总览、智能交通、智慧养护、"
    "智慧监测、数字应急、数字服务和资产资料中心七个业务视图，以 Cesium 在同一三维场景中承载全局施工模型与局部竣工模型，"
    "完成设备定位、图层编排、跨模型剖切、内部巡游、告警联动、资产资料查看和应急工况推演。"
    "施工模型与竣工模型按各自坐标变换参与同一世界剖切平面；竣工构件按模型目录建立可定位图标，并在远景做屏幕空间聚合；"
    "内部巡游沿竣工路面采样点按弧长推进；数字应急按火灾疏散、积水排涝、交通事故和日常巡检组织分步工况，并与三维巡游及通风效果联动。"
    "路径、图层、剖切和工况计算由自动化测试核查。平台把空间对象、业务信息和交互操作放在同一场景中，为隧道运维检视提供统一入口。"
)
keywords("隧道运维；数字孪生；建筑信息模型；Cesium；三维可视化；工况推演")

h1("1.引言")
h2("1.1研究背景")
body(
    "随着交通基础设施数字化的推进，隧道运维正在从平面台账和分散监控，转向以建筑信息模型和地理场景为底座的空间化管理。"
    "BIM 以构件保存几何与属性，三维场景提供缩放、拾取和相机定位。把二者放在同一运维界面中，可以把告警、监测、资产和应急步骤落到对应空间位置，缩短查找和核对的路径。"
)
body(
    "两湖隧道（南湖段）线位长、机电与结构设施种类多，施工模型和竣工模型分别描述整段空间关系和可独立检视的设备。"
    "值班、养护和应急处置都需要从“看见全隧道”走到“定位到具体构件”，并在定位之后继续查看资料、监测或工况步骤。本文围绕这一使用过程，给出可浏览、可检索、可定位、可剖切、可巡游的平台设计与实现。"
)
h2("1.2问题陈述")
body("隧道运维场景同时面对模型尺度、对象标识和业务过程三类问题：")
lead("空间信息与业务信息分离：", "设备台账、告警和监测曲线若不挂接到可定位的空间对象，值班人员仍需在图纸、列表和视频之间来回切换。")
lead("多模型难以同屏检视：", "全局施工模型与局部竣工模型的原点并不相同，剖切、图层和相机若按各自局部坐标处理，内部结构无法在同一位置对齐。")
lead("应急过程缺少连续表达：", "火灾排烟、积水排涝、交通事故和日常巡检包含步骤、持续时间和设备状态，仅用静态清单难以和隧道内部的巡游、高亮与通风效果一起查看。")
h2("1.3研究意义")
body(
    "本文给出一套可运行的隧道运维场景组织方法。表现层按业务模块切换信息面板和默认图层，场景协调层统一相机、模型和拾取，领域功能层把剖切、聚合、巡游和工况推演算成可复用模块，数据资源层提供施工模型、竣工模型、设备目录以及监测与应急数据。"
    "稳定的点位标识和构件目录使告警、资产和工况能够落到同一空间对象上，二维视图、内部巡游和剖切之间的状态可以恢复。该组织方式为隧道运维提供可操作的三维工作界面，并保留与现场监测、视频和工单继续衔接的对象标识。"
)

h1("2.平台总体架构设计")
h2("2.1设计原则")
body("平台遵循同一场景、稳定标识、状态可恢复和逻辑可核查四条原则。")
lead("同一场景：", "七个业务页面共用三维场景容器。进入页面时按模块打开默认图层和信息面板，空间检视不因切换业务而另起一套模型。")
lead("稳定标识：", "告警、监控、资产和工况通过点位标识或竣工构件编号发起定位，列表点选与场景点选打开同一资料面板。")
lead("状态可恢复：", "二维视图和内部巡游期间暂停剖切，返回三维外部视角后恢复进入前的剖切与侧栏状态。")
lead("逻辑可核查：", "路径采样、图层默认值、剖切换算、材质策略和工况插值与三维引擎分开，由单元测试和浏览器场景脚本分别核查。")
h2("2.2总体架构层级")
body("平台自下而上分为数据资源层、领域功能层、场景协调层和表现层，如图 1 所示。")
figure("fig-architecture.png", "两湖隧道智能运维管理平台逻辑分层")
lead("数据资源层：", "存放全局施工模型、局部竣工模型、可定位构件目录，以及监测、告警、工单和应急工况数据。模型以 3D Tiles 发布，业务对象以稳定标识与空间位置关联。")
lead("领域功能层：", "负责屏幕空间聚合、跨模型剖切、路面采样巡游、材质与通风表达、工况步骤插值。这些计算不依赖具体页面，供各业务模块调用。")
lead("场景协调层：", "管理 Cesium 场景生命周期、相机飞行、图层显隐、拾取与高亮。页面先完成标题和业务面板，再挂载三维场景，并在视角或模型变化时按需绘制。")
lead("表现层：", "以 Vue 3、TypeScript 和 Vite 组织七个业务视图，以 Element Plus 提供控制组件，以 ECharts 表达监测曲线。告警横幅、资料面板、巡游控制和工况步骤在这一层与场景交互。")
h2("2.3功能组成")
body("功能按运维检视的实际动作划分，对应关系见表 1。七个业务模块共享场景，进入模块时采用各自的默认图层，见表 2。")
add_table(
    "功能需求与平台能力",
    ["编号", "需求", "平台中的对应能力"],
    [
        ["F1", "整段与局部模型同屏", "施工模型交代空间关系，竣工段承载设备"],
        ["F2", "设备可检索、可定位", "竣工目录中可独立定位的构件建立图标与资料"],
        ["F3", "按业务模块组织图层", "各页面进入时采用对应的默认图层"],
        ["F4", "查看模型内部结构", "X、Y、水平 Z 剖切，可选择作用模型"],
        ["F5", "沿隧道内部检视", "按上下层路面采样路线巡游"],
        ["F6", "事件与场景联动", "告警、监控和资产操作定位到对应点位或构件"],
        ["F7", "应急过程可推演", "四类工况步骤、遥测与三维巡游联动"],
        ["F8", "资料与模型一致", "资产列表与场景点选打开同一资料面板"],
    ],
)
add_table(
    "业务模块与场景侧重",
    ["模块", "主要信息", "场景侧重"],
    [
        ["总览", "告警、交通、设备、工单与公众服务", "全图层与事件定位"],
        ["智能交通", "视频点位、交通状态与诱导信息", "隧道环境、交通管控"],
        ["智慧养护", "病害、工单与健康情况", "隧道环境、结构监测"],
        ["智慧监测", "气体、照度、通风与沉降", "环境、环控、结构监测"],
        ["数字应急", "火灾、积水、事故与巡检推演", "环境、环控、隧道机电"],
        ["数字服务", "公众反馈与预警发布", "隧道环境"],
        ["资产资料中心", "资产树与构件资料", "全部图层"],
    ],
)
h2("2.4运行与交互要求")
body(
    "进入页面后优先加载施工与竣工模型并飞到隧道范围，底图、正射影像和倾斜摄影在场景设置中调节显隐与透明度，与 BIM 检视分开控制。"
    "场景高度把手支持鼠标拖动、触屏和键盘方向键；系统开启减少动态效果时，自动动画让位于手动操作。"
    "从二维返回三维、从巡游返回外部视角时，恢复进入前的剖切和侧栏，避免一次检视打乱上一次的观察条件。"
)

h1("3.关键技术实现")
h2("3.1模型组织与跨模型剖切")
body(
    "全局施工模型与局部竣工模型以 3D Tiles 接入同一 Cesium 场景。两者局部原点不同，剖切平面先在世界坐标中确定，再按各模型根变换换算到局部坐标，使同一剖切位置在两个模型上对齐。"
    "施工模型以半透明方式保留整段轮廓；竣工路面保持模型自带材质，观察内部时再开启路面透视。剖切可选择全部模型、竣工段或施工模型，支持轴向、位置和反向保留，重置后恢复完整模型。控制面板与三维场景见图 2。"
)
figure("fig-section.png", "模型剖切控制与三维场景")
h2("3.2设备目录与空间点位")
body(
    "竣工模型目录中能够独立定位的构件生成分类图标，位置来自构件包围范围和模型变换。远景按屏幕像素距离聚合重叠图标，点击数字后展开成员并继续定位；告警和当前选中对象单独显示。"
    "镜头靠近设备后隐藏外部图标，拉远后再显示，并用不同的进入、退出距离避免图标闪烁。巡游过程中隐藏外部图标，便于直接观察模型。以整段合并导出的构件保持为整体对象，不拆成单独点位。"
    "资产资料中心用目录树对照三维模型，列表点选与场景点选打开同一资料面板，见图 3。"
)
figure("fig-asset.png", "资产资料中心与三维模型对照")
h2("3.3内部巡游")
body(
    "巡游路线取自竣工模型道路构件的上下层路面，每层一组采样点，运行时转换到世界坐标并加上观察高度。播放按路径弧长和时间推进。"
    "进入时从当前路线末端朝隧道内部行进，可切换上下层、暂停、反向和速度，并可按名称或构件编号检索设备。拖拽和滚轮会暂停播放，便于在当前位置环视。退出后恢复外部相机、图层和剖切状态。巡游画面见图 4。"
)
figure("fig-roaming.png", "竣工模型内部巡游")
h2("3.4定位链路与场景加载")
body(
    "告警横幅、告警列表、监控窗口和资产列表都通过稳定的点位或构件标识发起一次定位。目标图层处于关闭状态时，先打开对应分组再移动相机。二维视图使用固定范围定位，重复点击同一设施保持同一视野。处理链路见图 5。"
)
figure("fig-flow.png", "从操作到空间反馈的处理链路")
body(
    "页面先完成标题和业务面板，再挂载三维场景。场景优先加载施工与竣工模型并飞到隧道范围，按需渲染，把绘制集中在视角或模型发生变化时。"
    "工况脚本与三维引擎分开：步骤内的数值由起止值线性插值得到，再按阈值划分为正常、关注和告警三级，供界面进度和设备列表使用；场景按当前步骤播放相机、高亮和通风效果。"
)

h1("4.业务场景与运行效果")
h2("4.1项目概况")
body(
    "平台面向两湖隧道（南湖段）的日常检视与应急推演。施工模型提供整段空间参照，局部竣工模型提供可进入的车道、设备和结构。"
    "运行环境为支持 WebGL 2 的桌面浏览器。类型检查和生产构建用于确认页面与三维模块可以一起编译发布；单元测试覆盖路径、图层、剖切和工况计算，浏览器脚本在运行页面上检查二维定位、剖切恢复、告警与视频定位、聚合成员、巡游入场和各模块默认图层。"
)
h2("4.2总览监测与资产检视")
body(
    "总览在同一场景中给出隧道形态，并并列告警、交通、设备、工单和公众服务信息。告警和重点监控可以直接定位到对应点位，见图 6。"
    "智慧监测把气体、照度、通风和结构沉降放在环境与结构图层上，用曲线表达环境量，见图 7。"
    "智能交通侧重视频点位、区段运行状态和诱导信息；智慧养护侧重病害、维修工单和结构健康；数字服务侧重公众反馈与预警发布。这些页面进入时切换默认图层，定位仍走同一套点位标识。"
)
figure("fig-overview.png", "总览页面中的施工模型与运维信息")
figure("fig-monitoring.png", "智慧监测中的环境与照明信息")
h2("4.3数字应急与工况推演")
body(
    "数字应急将火灾疏散、积水排涝、交通事故和日常巡检组织为分步推演。每步包含说明、持续时间和沿路线的位置，遥测数值在步骤内按进度插值，并给出联动设备状态。"
    "推演界面与上方三维场景同步：可跳转步骤、调整速度，并联动内部巡游。竣工段同时表达风机叶轮转动和气流方向，通风模式分为日常通风、火灾排烟和停机，负荷可调。运行画面见图 8。"
)
figure("fig-emergency.png", "数字应急工况推演")
h2("4.4运行效果")
body(
    "总览把隧道形态和告警、设备、工单放在同一视野；剖切面板与模型同屏，可按轴向查看内部；巡游进入竣工段车道，并提供层切换和设备检索；应急页面把工况步骤、遥测和三维场景放在一起；资产页用目录树对照模型；监测页用曲线表达环境量。"
    "共享场景因此可以承载不同业务的定位和检视。对象标识、图层恢复和工况插值保持独立，模型或页面调整时可以分别核查。"
)

h1("5.总结与展望")
h2("5.1总结")
body(
    "本文给出了两湖隧道（南湖段）智能运维管理平台的设计与实现。平台以 Cesium 场景统一施工模型与局部竣工模型，通过设备目录、屏幕空间聚合、跨模型剖切、路面采样巡游、告警定位和应急工况推演，把运维信息落到可检视的空间位置。"
    "表现层、场景协调层、领域功能层和数据资源层的划分，使相机、剖切、巡游和工况可以随模型和页面一起维护。七个业务模块验证了共享场景按默认图层组织信息的方式。"
)
h2("5.2展望")
body("平台已经把模型、设备、事件和工况组织在同一空间入口中。后续工作沿这个入口继续扩展：")
lead("数据持续汇入：", "按现有点位标识接入现场监测、视频和工单记录，使曲线、画面和空间位置保持同一对象。")
lead("模型更新核对：", "在施工或竣工模型更新后，自动核对设备目录、图标位置和巡游采样路线。")
lead("过程记录：", "围绕查找设备、确认告警和完成一次应急推演，记录操作时间与完成情况。")
lead("部署保障：", "在部署环境中补充身份权限、传输保护和运行监测，并继续沿用当前的对象标识和场景状态恢复方式。")

p = add_p(first=560, line=480, rule="exact")
run(p, "参考文献", 14, bold=True)
for ref in (
    "[1] 吴志强，甘惟，臧伟，等. 城市智能模型（CIM）的概念及发展[J]. 城市规划，2021，45（4）.",
    "[2] ISO. ISO 19650-1:2018 Organization and digitization of information about buildings and civil engineering works, including building information modelling (BIM) — Information management using building information modelling — Part 1: Concepts and principles[S]. Geneva: ISO, 2018.",
    "[3] Open Geospatial Consortium. OGC 3D Tiles Specification, Version 1.1[EB/OL]. https://docs.ogc.org/cs/22-025r4/22-025r4.html.",
    "[4] Cesium. CesiumJS Documentation[EB/OL]. https://cesium.com/learn/cesiumjs/ref-doc/.",
    "[5] Vue.js. Vue.js Guide[EB/OL]. https://vuejs.org/guide/introduction.html.",
    "[6] 中华人民共和国住房和城乡建设部. 建筑信息模型应用统一标准：GB/T 51212—2016[S]. 北京：中国建筑工业出版社，2016.",
):
    body(ref)

footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
_indent(footer, 0)
_spacing(footer, before=0, after=0, line=240, rule="auto")
run_begin = footer.add_run()
paint(run_begin, 9, bold=False)
fld_begin = OxmlElement("w:fldChar")
fld_begin.set(qn("w:fldCharType"), "begin")
run_begin._r.append(fld_begin)
run_instr = footer.add_run()
paint(run_instr, 9, bold=False)
instr = OxmlElement("w:instrText")
instr.set(qn("xml:space"), "preserve")
instr.text = " PAGE "
run_instr._r.append(instr)
run_end = footer.add_run()
paint(run_end, 9, bold=False)
fld_end = OxmlElement("w:fldChar")
fld_end.set(qn("w:fldCharType"), "end")
run_end._r.append(fld_end)

header = sec.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.CENTER
_indent(header, 0)

d.save(OUT)
print(OUT)
