---
title: 最近很火的“专家出题”到底是怎么一回事？如何从零出一道保质保量的工程类专家题目（万字实战全书）
published: 2026-11-25
description: 一线工程复盘万字全书：拆解当下大模型“专家出题”的真实运作机制与审题淘汰铁律，揭示传统静态 CSV 拟合题如何被 500 行 Levenberg-Marquardt 反演秒穿，并手把手给出 5 套 CC0/CC BY 4.0 真实物理数据源、stdin/stdout JSON-RPC 防泄露沙盒源码骨架、48/48/48 正交切分、6 档校准梯与临场微调决策树。
image: /images/posts/expert-benchmark-authoring-cover.webp
tags:
  - 专家出题
  - AI基准测试
  - Agent评测
  - 科学计算
  - 工程实战
category: 工程实战
---

## 引言：大家都在聊的“专家出题”，到底在出什么、考什么？

过去一年，技术社区、科研群甚至求职平台上，“大模型专家出题”几乎成了现象级关键词。海外有 *Humanity’s Last Exam (HLE)*、*FrontierMath*、*PaperBench* 这类动辄集结各国教授、博士生乃至顶尖数学家闭门编撰的高难基准；国内各大模型厂商、AI 实验室与科研评测平台也在密集面向物理、材料、流体、电力、控制、化学和计算机等理工科背景的硕博与一线工程师高薪招募“出题专家”。

很多第一次听说这个概念的人会有两个典型误解：
- 误解一：以为和早年的“AI 数据标注”差不多，找人写点难一点的考研压轴题、竞赛大题，附上标准答案就行；
- 误解二：以为只要自己挑一个冷门到全网搜不到的专业分支，把核心物理公式搞得越偏门、参数越多，大模型就一定做不出来。

**真实的一线工程现实往往恰恰相反：**
1. **现代前沿“专家出题”交付的根本不是一份 Word 考卷，而是一个“完全离线可运行的容器化科研/工程任务仓库”**——里面包含真实可溯源的实验室底层数据、公开可读但强非线性耦合的物理前向引擎、经过防泄露严格隔离的测试沙盒、一个保底可运行的工程 Baseline、一套作者亲自跑通的第一性原理参考解（Author Reference），以及全自动可客观打分的验证容器（Verifier）。
2. **绝大部分首次投稿的“纯专业难题”在质量门禁阶段就会直接被枪毙（行业内很多初版题目通过率极低）**——不是因为专家专业水平不够，恰恰相反，很多专家出了自认为极其硬核的题，一扔进**能连续自主写代码、跑实验、看日志、改算法迭代 4–7 小时（50–350 轮）的长程代码智能体（Long-Horizon Research/Coding Agent）**里，立刻全军覆没：**要么弱模型和强模型分数完全粘死在噪声地板上，要么代理模型靠扫描目录/利用隐性漂移/写 500 行通用局部拟合直接偷鸡通关。**

这篇文章基于近期多轮真实物理科学与工程基准的构建、踩坑、翻车重做与全流程交付验证经验，**不讲任何空泛口号，写成一篇你可以直接拿去对照复现的万字实战全书**：
- 第一部分：彻底讲透行业里“专家出题”为什么卡得严、长程 Agent 是怎么“偷鸡通关”静态题的；
- 第二部分：公开 **5 套经过实际验证、CC0 / CC BY 4.0 协议完全免费可复用的真实物理实验室数据源**（含完整 DOI、样本结构与透明分层卡片 `SOURCE_CARD` / `DATA_CARD` 模板）；
- 第三部分：给出 **4 大防偷鸡闭环题型范式**，剖析如何构造“低信噪比付费诊断”与“表观相同、动作相反”的物理冲突分支；
- 第四部分：直接给出 **Environment / Verifier 双容器防泄露目录树 + `stdin/stdout JSON-RPC` 进程隔离核心源码骨架**（含一个极其隐蔽的 `fd 1` 污染真实踩坑修复）；
- 第五部分：**48/48/48 正交切分、截断质量公差分布、尾风险加权聚合、`Strong_Proxy` 六档本地校准阶梯与临场微调决策树**；
- 第六部分：**8 类负样本拒判单元测试、离线 `cp312` 容器打包与发布前最终检查单**。

---

## 第一章 真实踩坑复盘：为什么 80% 看起来很硬核的“静态专家题”，上线就废了？

### 1.1 长程 Agent 评测跟传统大模型刷题到底差在哪？

早期的 MMLU、GPQA 甚至普通单轮代码生成题，考的是**“单步开卷记忆”**：模型看到题干，一次性吐出推理过程和答案，整个上下文生命周期只有几十秒。

而现在真正决定研发、科研与工程落地价值的，是**长程自主科研评测（Long-Horizon Benchmark）**：
- 给 Agent 一个干净的 Linux Docker 工作区和终端执行权限（无外网访问）；
- 赋予它连续运行 **4 到 7 个小时** 的窗口，自主阅读 `data/` 里的实验数据、研究 `engine/task_model.py` 里的物理规律、反复修改自己的求解代码、运行自检脚本验证、查看每组误差分布、推翻重来，实测跑满 **50 到 350 轮假设-验证-演化循环**，最终产出一套 **`500–1,400` 行** 的多模块科学计算工程代码；
- 最终评估时，独立的 Verifier 容器在**完全盲态的 Hidden 隐藏工况**上冷启动 `fit()` 和 `solve()`，同时卡死**硬物理约束零违约**与**最坏工况损失表现**。

在这种残酷的长时间自主演化压力下，任何设计偷懒的静态题都会被瞬间拆穿。

### 1.2 血泪对照实录：从 `0/3` 全部淘汰到 `3/3` 全通过的真相

很多工程师在第一版出题时，最自然的直觉就是：**去学术论文里扒一批高含金量的实测台架数据，按常规机器学习思路切成 `train.csv` 和 `test.csv`，让 Agent 写一个 `predict.py` 拟合未见测试集，谁误差小谁赢。**

我们在高频铁氧体磁芯非正弦损耗（`FerriteLoop`）、多孔材料声学阻抗管反演（`AcoustiPorous`）与 PEM 燃料电池电堆极化/阻抗谱（`PEMStack`）这三道完全基于真实同行评审论文实验数据的物理课题上，亲身踩过一次完整的对照坑——**Round 1（纯静态拟合形态）`0/3` 全部失效，Round 2（交互诊断 + 物理因果闭环重构）`3/3` 全部高区分度通过**。

这背后暴露出了长程评测中最致命的三个“反常识陷阱”：

#### 陷阱一：“高信噪比简易局部反演陷阱”（High-SNR Easy-LM Trap）
在静态高信噪比回归任务（或单次查询返回高清多频点无噪曲线的任务）里，哪怕模型根本没有吃透底层的物理偏微分方程或磁滞本构分解，**一个中等编程能力的代理只需 20 分钟、写一段 500–700 行的向量化多起点 Levenberg–Marquardt（LM）非线性最小二乘优化 + 一个经验训练残差 `1.5×` 安全盒，就能把测试误差直接压到实验室测量本身的重复性噪声地板附近（例如相对误差 ~3%–5%）。**

一旦到达测量噪声地板，更强的推理模型哪怕花 7 小时、迭代 100 多轮写出 1,300 行融合多物理场先验与贝叶斯后验采样的求解器，也因为物理天花板被死锁而**根本拉不开得分差距**（甚至可能平局或因局部过拟合反输）。

#### 陷阱二：Visible 泄露或全局常数漂移作弊
只要评测集没有把单个工况的潜变量与随机种子彻底从工作区剥离，哪怕你把真值文件起名叫 `visible_truth.csv` 藏在子目录里，长程 Agent 在终端里一通 `find` / `grep` 就能“合理合规地”扫到文件，或者直接把 Visible 测试集当作微调训练集反推一个全局尺度修正系数。更隐蔽的是：**如果 Visible（可见集）和 Hidden（隐藏集）的参数偏移方向是一致的**，只靠在 Visible 上试凑几个经验漂移常数的投机策略，在 Hidden 上也能白白蹭分。

#### 陷阱三：无约束自由正态抽样导致的“47/48 偶发死刑”
有些作者为了“增加难度”，直接对 8–10 个物理潜变量做无边界高斯采样。结果 48 个测试用例里总有 1 个倒霉的样本同时撞上了 3 个以上方向的 $3\sigma$ 极端联合分布，物理上根本不存在满足全部工程约束的可行解！一旦设置“48/48 必须全部满足物理约束才算有效得分”的硬门禁，顶尖强模型和作者参考解自己都会因为那 1 个极端样本变成 `47/48 → 0 分`，导致整道题在最终验收时作废。

---

## 第二章 Step 1：数据源怎么选？公布 5 套可直接复用的开源真实实验底座

![工程类专家题目四阶段防捷径构建流水线](/images/posts/expert-benchmark-pipeline.webp)

不管是用于严肃科研基准发论文，还是做工业级高标准 Benchmark 交付，**数据源合规性与物理真实性永远是第一道一票否决门禁**。

绝对不要偷懒让大语言模型直接凭空生成假数据，也不要去爬授权不明的商业白皮书或教材习题。目前最被审稿人与评测机构认可的做法是 **「双层透明架构（Calibrated Real-Data Provenance）」**：
1. **实测物理底盘（Real Experimental Foundation）**：基础材料色散、风洞速度场、铁氧体任意波形实测损耗、阻抗管吸声曲线、电堆极化与复阻抗谱，**100% 下载自同行评审期刊或 Zenodo 的 CC0 1.0 / CC BY 4.0 原始数据仓库**，并在元文件里记录每份原始文件的精确字节数、MD5 与 SHA-256；
2. **公开物理引擎扩展（Disclosed Open Physics Extensions）**：将实际科研中昂贵的批次离散、腔室漂移、噪声耦合台架查询与极端热-电-力耦合边界封装进完全开源可读的 `engine/task_model.py`，并在 `DATA_CARD.json` 与 `SOURCE_CARD.md` 里一五一十写清“哪些行是实验室实测、哪些响应是校准后的公开物理模型扩展”，做到零隐瞒、零造假。

以下 **5 套互不重叠、全部完成实时核验的 CC0 / CC BY 4.0 物理工程开源数据源**，你可以直接按规范引用构建自己的基准题目：

### 数据源 1：多层光学薄膜色散与宽带镀膜工艺（`OptiCoat_R1` 底座）
- **上游数据集**：`refractiveindex.info-database`（Mikhail N. Polyanskiy, *Scientific Data* **11**, 94, 2024）
- **DOI 与仓库**：[`10.1038/s41597-023-02898-2`](https://doi.org/10.1038/s41597-023-02898-2) · `https://github.com/polyanskiy/refractiveindex.info-database`
- **开源许可**：**CC0 1.0 Universal**（公共领域，47.8 MB YAML 实测复折射率材料库）
- **实测与扩展切分**：各类镀膜介质与金属材料的实测复折射率色散曲线 $n(\lambda), k(\lambda)$ 全部来自公开库；镀膜腔室不同批次的沉积速率 tooling factor 漂移、堆积密度导致的折射率偏移、有限见证片椭偏测量预算与基于麦克斯韦 $2\times 2$ 传输矩阵法（TMM）的多层斜入射（$0^\circ$–$55^\circ$）双偏振反射与膜层残余应力平衡约束为显式公开物理仿真扩展。
- **核心考法**：离散材料配对 × 连续膜厚 × 工艺/应力硬约束下的宽角鲁棒逆向设计。

### 数据源 2：多风机偏航尾流速度亏缺与风洞扫描激光雷达实测（`YawWake_R1` 底座）
- **上游数据集**：TUM / PoliMi G1 缩比三风机集群风洞试验数据库（Campagnolo, Aktan, Bortolin, Tamaro, Mühle, Bottasso）
- **DOI**：[`10.5281/zenodo.18731994`](https://doi.org/10.5281/zenodo.18731994)
- **开源许可**：**CC BY 4.0**（579.4 MB：`Multiple Wake.zip`、`TestMatrix.xlsx`、`README.md`、`LICENSE.txt`）
- **实测与扩展切分**：参考皮托管来流风速、转盘风向角、空气密度、两台扫描激光雷达（Scanning LiDAR）实测尾流二维速度断面与风机载荷均为真实风洞测量；切分时严格按 `TestMatrix.xlsx` 中的**完整试验工况/偏航组合整组留出**（严禁随机抽取同一扫描截面像素防空间泄露）。
- **核心考法**：建模偏航诱发尾流中心线偏转、近尾流势核长度与反向旋转涡对非对称扩张，并在流向动量通量守恒硬约束下外推未见多机叠加工况。

### 数据源 3：高频铁氧体磁芯非正弦任意波形铁损数据库（`FerriteLoop_R1` 底座）
- **上游数据集**：Princeton / Dartmouth MagNet Initiative N87 任意波形磁滞损耗数据集（Guillod et al., *IEEE APEC 2023*）
- **DOI**：[`10.1109/APEC43580.2023.10131348`](https://doi.org/10.1109/APEC43580.2023.10131348) · [`10.5281/zenodo.7368936`](https://doi.org/10.5281/zenodo.7368936)
- **开源许可**：**CC BY 4.0**（10 个文件合计 20.8 MB，核心含常温 `N87_ambient_temperature.csv` `12,341` 行与变温 `N87_variable_temperature.csv` `29,741` 行，合计 **`42,082` 条实测激励波形数据**与 `cores.json` 官方 EPCOS/TDK 磁芯规格）
- **实测与扩展切分**：所有 $B(t)$ 励磁波形与单位体积铁损均为台架真实测量（标定物理常量名义库 RMSE `0.0598`，中位对数绝对误差 `0.0328`）；交互式 12 项台架诊断读数、磁芯制造批次导磁率/弛豫潜变量、以及电感自热平衡与热失控正反馈不动点（$dP_{\text{core}}/dT \ge 1/R_{\text{th}}$）由公开的 `engine/task_model.py` 严格求解。

### 数据源 4：多孔吸声材料阻抗管实测与几何公差库（`AcoustiPorous_R1` 底座）
- **上游数据集**：TU Graz / University of Naples ISO 10534-2 双传声器阻抗管实测数据（Caiazzo et al., *Acta Acustica* 2025）
- **DOI**：[`10.1051/aacus/2025033`](https://doi.org/10.1051/aacus/2025033) · [`10.5281/zenodo.15407780`](https://doi.org/10.5281/zenodo.15407780)
- **开源许可**：**CC BY 4.0**（5.2 MB：`alphas.csv` 含 `864` 组 150–1600 Hz @ 2 Hz 实测吸声曲线、`diameter.csv` 6 维游标卡尺实测直径、`targets.csv`、`Read_Me.pdf`）
- **核心考法**：阻抗管中试件的微小径向偏差会引入**周向空气隙泄露**与**边缘压缩箍紧**两个物理方向相反的伪影（挤压去除了缝隙漏声利于低频，却同时激发框架剪切共振凹陷损害中频）。需要先利用交互测量分离测量伪影并反演本征 Johnson–Champoux–Allard（JCA）五参数 $(\sigma, \phi, \alpha_\infty, \Lambda, \Lambda')$，再在总厚度与面密度硬约束下联合优化微穿孔板-背腔-多孔层的宽带声学器件。

### 数据源 5：PEM 燃料电池电堆敏感性极化与空间分辨复阻抗谱（`PEMStack_R1` 底座）
- **上游数据集**：HyFaB / RealHyFC 10 节短堆实测台架数据库（Fensterle et al., *Fuel Cells* 2026, 26, e70057）
- **DOI**：[`10.1002/fuce.70057`](https://doi.org/10.1002/fuce.70057) · [`10.5281/zenodo.19068126`](https://doi.org/10.5281/zenodo.19068126)
- **开源许可**：**CC BY 4.0**（9 个文件合计 770.5 MB：标称极化曲线、温度/压力/湿度/化学计量比四套敏感性扫描 CSV、电堆级 `EIS.zip` 与空间分辨 `spatiallyResolvedEIS.zip`）
- **核心考法**：电化学（Butler–Volmer）- 水合（膜水活度）- 传质（多孔扩散极限）三机理耦合与**因果在线闭环控制**——**质子膜干涸（Dryout）** 与 **阴极水淹（Flooding）** 在廉价直流电压上都会表现为剧烈压降，但所需控制动作截然相反！

### 附：`DATA_CARD.json` 标准工程元数据卡真实模板

在题目根目录强制放置如下透明数据声明文件，是所有学术审稿与专业验收最加分的一环：

```json
{
  "task_name": "FerriteLoop_R1",
  "slug": "ferriteloop_r1",
  "version": "3.0.0",
  "domain": "Physical Sciences & Engineering / Power Electronics Magnetics",
  "data_authenticity": {
    "real_experimental_data": "100% real laboratory measurements in data/train/magnet_n87_real.npz (all 42,082 rows from Zenodo 10.5281/zenodo.7368936: R22 at 25 C and R34 at 25/50/70/90 C) and official EPCOS/TDK core datasheet specs in data/train/cores.json.",
    "calibrated_open_simulator": "Nominal N87 core-loss physics constants in engine/task_model.py are calibrated directly on all 42,082 real MagNet rows (RMSE = 0.0598, median |ln err| = 0.0328). All 12-test interactive bench query responses, lot/assembly latent parameter perturbations, converter mission points, and coupled thermal fixed-point solutions are generated by the disclosed open engine."
  },
  "upstream_source": {
    "source_family_id": "magnet_n87_arbitrary_waveform_7368936",
    "zenodo_doi": "10.5281/zenodo.7368936",
    "paper_citation": "T. Guillod et al., IEEE APEC 2023, DOI: 10.1109/APEC43580.2023.10131348",
    "license": "CC BY 4.0"
  },
  "splits": {
    "train": { "n_cases": 48, "structure": "6 mechanism groups x 4 families x 2 realizations", "latent_exposed": true },
    "visible": { "n_cases": 48, "structure": "6 mechanism groups x 4 families x 2 realizations", "latent_exposed": false },
    "hidden": { "n_cases": 48, "structure": "6 mechanism groups x 4 families x 2 realizations (outer-envelope hazard shifts)", "latent_exposed": false }
  }
}
```

---

## 第三章 Step 2：设计防偷鸡题型——4 大经受过长程实战检验的结构范式

有了真实数据源，**绝对不要直接出成 `train.csv → predict.py → test.csv` 的静态预测题**。要真正拉出“第一性原理物理建模 + 不确定性决策”与“局部曲线拟合 + 硬编码规则”的差距，必须采用以下 **4 种经过长程实战检验的任务原型** 之一：

### 原型 1：付费低信噪比诊断 + 耦合硬约束混合整数设计
- **适用题材**：材料与器件反演、磁热电设计、光学膜系、声学吸声结构、机械密封/参数校准。
- **核心设计机关**：
  1. 每个测试用例有 `6–10` 个未公开的个体制造偏差/环境潜变量（例如每颗磁芯不同的弛豫衰减因子、热阻偏移与频率拐点）；
  2. 求解器在决策前仅有严格的测试预算（例如从 `12–14` 个可选台架测试项目里花钱购买 **2 项** `case.query(test_id)`）；
  3. **信噪比控制铁律（防 Easy-LM 陷阱核心！）**：千万不能让 2 次诊断直接返回“上百个高精度无噪频率扫描点”！真实实验室快速抽检返回的是 **3–6 个带现实测量噪声的紧凑标量/带通特征（或故意将 2–3 个物理量线性混叠在同一个读数里）**。这样一来，单点 LM 反演会留下一条长长的**相关零空间山脊（Correlated Posterior Null-Space Ridge）**，逼迫优秀 Agent 放弃单一最佳点，转而构建**贝叶斯重要性采样云 / 拉普拉斯协方差后验 + 跨后验云最坏情况联合优化**；
  4. **离散 + 连续强耦合固定点**：决策输出同时包含离散选型（如选哪颗磁芯、哪种基板/膜材）和连续参数（如匝数、气隙、膜厚、风场偏航角），目标或约束由非线性不动点决定（例如 `FerriteLoop` 中损耗随温度呈非单调谷底，压低损耗本应降到温谷附近，但过冲后斜率变正会触发热失控正反馈死循环）。
  5. **自适应诊断分支（Adaptive VoI Bonus）**：让第 1 次查询扮演“分诊初筛（Triage Screening）”角色（或直接暴露可观测任务工况线索），而 `4–6` 类专精复测彼此正交互斥。这能确保**任何单一固定 `2-test` 盲查组合都至少会让 2 个故障组严重失明**，迫使 Agent 根据第 1 次返回动态决定第 2 步该测哪一项。

### 原型 2：严格因果在线闭环控制 + 冲突分支在线诊断
- **适用题材**：燃料电池热/水管理、风机尾流偏航协同调控、化工反应釜热失控抑制、高精度热补偿。
- **核心设计机关**：
  1. 仿真按离散时间步严格因果向前推进：每一步只观察当前含噪传感器读数，输出带**执行器速率上限（Rate Limit）与热/流体时间常数滞后**的控制量，未来负载突变和扰动全部封存在黑盒中；
  2. **表观混淆与动作反转（Confounded Hazards）**：设计两类在廉价直流指标上表现一模一样的故障，但纠偏方向恰恰相反——比如 `PEMStack` 里，膜干涸和阴极水淹都会把单池电压拽低、欧姆/极化压降抬高，可前者必须提高露点湿度并降化学计量比，后者却必须立刻暴力吹扫提计量比并降加湿！
  3. **有限次付费在线诊断**：求解器整个周期只有寥寥几次呼叫高代价诊断的权限（如触发一次局部 EIS 交流高频-低频扫频 `case.run_diag(...)`）。浅层 Agent 通常写 500 行双阈值锁存状态机“赌概率”，在交叉临界边界成片翻车；高阶 Agent 则会在几小时迭代中写出结合卡尔曼状态观测器 + 粒子滤波后验分型 + 滚动时域优化（MPC）的工业级控制器。

### 原型 3：历史依赖型多场景结构 / 工艺时序硬约束优化
- **适用题材**：热固耦合壳体屈曲、多工步粉末压制模具成型、热固性胶黏剂固化曲线、岩土固结排水。
- **核心设计机关**：时间演化过程中包含塑性记忆、残余热应力或固化动力学等**不可逆路径依赖**——早期决策会永久收窄或锁死后期极端载荷下的安全窗口，贪心局部最优注定在中后期违背多角落硬约束。

### 原型 4：高难度数值求解 / 稀疏自适应反演 / 因果在线资源调度
- **适用题材**：带探测器记忆效应的剂量受限自适应 CT 扫描、大规模结构自适应降阶迭代、带执行延迟与 DAG 依赖的多集群流式调度。

---

## 第四章 Step 3：零泄露工程沙盒代码实战（直接可用的核心架构）

防作弊不能靠在 `instruction.md` 里口头写“请模型不要偷看测试数据”，**必须靠操作系统的进程边界与文件隔离物理封死**。

### 4.1 严格隔离的双平面对目录树（`Environment` vs `Verifier`）

Deliver 给 Agent 工作区的打包物里**绝不允许出现 `tests/` 目录与隐藏Anchors**：

```text
<TaskName>/
├── DATA_CARD.json              # 真实实验数据 vs 公开物理引擎边界声明
├── SOURCE_CARD.md              # 原始文献、DOI、License 与文件级 MD5/SHA256 核验
├── instruction.md              # 纯英文客观任务书（严禁出现任何对比模型名或隐藏锚点）
├── requirements.txt            # 锁定科学计算版本依赖
├── data/
│   └── train/                  # 仅放置真实实测底座文件 + 暴露真值的 48 组 train_cases.json
├── engine/
│   ├── __init__.py
│   ├── task_model.py           # 100% 公开的物理方程（方便求解器直接写伴随、雅可比与观测器）
│   ├── evaluator.py            # 子进程隔离 + stdin/stdout JSON-RPC 评估引擎
│   └── visible_cases.json      # 仅包含可见集输入工况描述（严禁夹带 visible_truth！）
├── methods/
│   ├── main/method.py          # 附带的保守合法 Baseline (export: fit + class Method)
│   ├── selfcheck.py            # 供 Agent 在可见集上自测可行率与归一化得分的工具
│   └── score_norm.py           # 归一化计分工具
└── tests/                      # 【仅位于独立 Verifier 容器！禁止放入公开工作区】
    ├── task_model.py           # 与 engine/ 字节一致的引擎镜像
    ├── evaluator.py            # 与 engine/ 字节一致的隔离评估器镜像
    ├── grade.py                # 终审裁判：强制在纯净目录重新 fit() 后跑 Visible 与 Hidden
    ├── fixtures/
    │   ├── train/              # 与 data/train/ 字节级一致，防候选代码篡改训练数据
    │   ├── visible_cases.json
    │   ├── hidden_cases.json   # 独立隐藏工况与潜变量真值（全流程隔离）
    │   ├── anchors.json        # 经 6 档标定确认锁死的 Baseline / Reference 损失锚点
    │   └── FIXTURE_SHA256.json # 上述所有固定件的哈希指纹清单
    └── test.sh                 # 纯 LF (\n) 换行符评分脚本
```

注意两条经常被人忽略的隔离红线：
1. **`engine/task_model.py` 应当完全开源透明，而不是加密混淆！** 把物理前向模型做成一个黑盒 `.so` 二进制并不能考出真科研能力，反而会把科学计算问题变成盲猜黑盒。真正好的科研题是“牛顿/麦克斯韦/电化学方程摆在明面上，你自己写观测器、求雅可比和贝叶斯反演去跟未知潜变量及硬约束死磕”。
2. **终审 `tests/grade.py` 必须强行丢弃工作区自带的 `artifact` 缓存，只认 `methods/main/` 源码，用验证集侧纯净副本 `/tests/fixtures/train` 重新冷启动 `fit()`**，防止 Agent 在 `fit()` 阶段写死后门或者把偷来的结果硬塞进序列化模型文件中。

### 4.2 `engine/evaluator.py` 子进程 `stdin/stdout JSON-RPC` 隔离实战代码

下面这段核心工程骨架提炼自实测验证过的评估器，直接解决**“禁止软链接逃逸 + 计算产物哈希 + 隔离进程冷跑 `fit` + 管道守护进程不泄露潜变量 + 防止候选代码 `print()` 冲毁 JSON-RPC 通信”**五大难点：

```python
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

SKIP_NAMES = {"__pycache__", ".git", ".pytest_cache"}

def validate_and_hash_method_dir(method_dir: Path) -> dict:
    """拒绝任何软链接/目录逃逸并计算唯一源码指纹，保证评测不可篡改"""
    if method_dir.is_symlink():
        raise RuntimeError(f"method directory must not be a symlink: {method_dir}")
    entry = method_dir / "method.py"
    if not entry.is_file() or entry.is_symlink():
        raise RuntimeError(f"missing regular entrypoint method.py in {method_dir}")

    root_resolved = method_dir.resolve()
    h = hashlib.sha256()
    file_count = 0
    for dirpath, dirnames, filenames in os.walk(method_dir, followlinks=False):
        dp = Path(dirpath)
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_NAMES)
        for d in dirnames:
            if (dp / d).is_symlink():
                raise RuntimeError(f"symlink directory forbidden: {dp / d}")
        for fn in sorted(filenames):
            if fn in SKIP_NAMES or fn.endswith(".pyc"):
                continue
            fp = dp / fn
            if fp.is_symlink() or not fp.is_file():
                raise RuntimeError(f"invalid artifact file: {fp}")
            rel = fp.resolve().relative_to(root_resolved).as_posix()
            h.update(rel.encode("utf-8") + b"\x00")
            h.update(hashlib.sha256(fp.read_bytes()).digest())
            file_count += 1
    return {"sha256": h.hexdigest(), "file_count": file_count}

def clean_worker_env(sandbox_root: Path) -> dict[str, str]:
    """锁定单线程 BLAS 并隔离 PYTHONPATH，避免多核争抢造成评测时间抖动"""
    env = os.environ.copy()
    for k in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[k] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONUTF8"] = "1"
    env["PYTHONPATH"] = str(sandbox_root)
    return env
```

最关键的是在拉起 `solve()` 子进程时，**如何保证候选代码随便 `print("iter 10...")` 甚至底层 NumPy/C 扩展报错输出，绝对不会把管道里的 JSON-line 协议冲乱？** 标准做法是开场立刻把 `fd 1` 复制保留给私有 RPC 通道，再把所有标准输出重定向到 `stderr`：

```python
_SOLVE_RPC_WORKER_CODE = r"""
import importlib.util, json, os, sys
from pathlib import Path

# 核心技巧：复制文件描述符 1 专门用于结构化 JSON-line RPC 通信；
# 随即将 fd 1 (含 Python sys.stdout 与 C 层 printf) 全部重定向至 stderr，杜绝候选代码 print 破坏协议！
_rpc_fd = os.dup(1)
os.dup2(2, 1)
_rpc_out = os.fdopen(_rpc_fd, "w", buffering=1, encoding="utf-8")
sys.stdout = sys.stderr

sandbox_root = Path(sys.argv[1]).resolve()
method_file = Path(sys.argv[2]).resolve()
artifact_dir = Path(sys.argv[3]).resolve()
for p in (str(sandbox_root), str(sandbox_root / "engine"), str(method_file.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

def _send(obj):
    _rpc_out.write(json.dumps(obj) + "\n")
    _rpc_out.flush()

def _recv():
    line = sys.stdin.readline()
    return json.loads(line) if line else None

class RPCCaseHandle:
    \"\"\"暴露给候选求解器的黑盒工况句柄：内部完全不存在 _latent 与 _query_seed\"\"\"
    def __init__(self, msg):
        self.case_id = str(msg["case_id"])
        self.spec = dict(msg["spec"])
        self.max_queries = int(msg["max_queries"])
        self.query_catalog = {k: dict(v) for k, v in msg["query_catalog"].items()}
        self._queries_log = []

    def query(self, test_id: str) -> dict:
        if len(self._queries_log) >= self.max_queries:
            raise RuntimeError(f"query budget exceeded: max={self.max_queries}")
        _send({"cmd": "query", "test_id": str(test_id)})
        resp = _recv()
        if not resp or not resp.get("ok"):
            raise RuntimeError(resp.get("error", "rpc query failed") if resp else "rpc eof")
        self._queries_log.append(resp["record"])
        return dict(resp["record"])

spec = importlib.util.spec_from_file_location("candidate_method", str(method_file))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
solver = mod.Method(artifact_dir)

_send({"status": "ready"})
while True:
    req = _recv()
    if req is None or req.get("cmd") == "shutdown":
        break
    if req.get("cmd") == "solve_case":
        handle = RPCCaseHandle(req)
        design = solver.solve(handle)
        _send({"cmd": "solution", "case_id": handle.case_id, "design": design, "queries": handle._queries_log})
"""
```

同时别忘了在评估器侧加上 `verify_fixture_hashes(fixtures_dir, fixtures_dir / "FIXTURE_SHA256.json")`——只要验证容器里任何基准文件被异常修改，裁判启动第一步就直接报错熔断。

### 4.3 `48 / 48 / 48` 正交工况划分、截断 QC 分布与尾风险聚合

很多工程题分数抖动极大，核心原因在于样本切分和聚合函数没做好：

1. **正交工况结构（`6 × 4 × 2 = 48`）**：
   - 将每个 split（Train / Visible / Hidden）均设计为 **`6` 个正交物理机制失效族 × `4` 种工况族 × `2` 次随机实现 = `48` 组**；
   - **正交与对称分布原则**：Visible 偏移方向与 Hidden 偏移方向保持正交对称（例如不同工况族分别覆盖正/负热阻漂移、高/低频外推区、干燥/过湿极端边界，且 Hidden 适度引入更苛刻的外包络边界扰动，例如负载上浮 `+4%`、环境温升 `+2 °C`）。这样只靠在 Visible 上背出几个常数漂移量的做法，跑到 Hidden 上不仅不涨分还会直接掉分。
2. **截断工业质量公差采样（Truncated QC Distributions）**：
   - 将每个 case 的潜变量截断在真实产线质量抽检公差范围（例如 **$\pm 1.7\sigma \sim 2.0\sigma$**），坚决不用无界正态分布去生成参数。既保证极端工况组合真实可解，又杜绝偶然冒出一个 $4.5\sigma$ 怪物样本把强算法随机判成 `47/48 → 0 分`。
3. **尾风险加权聚合 + 零容忍硬可行性闸门**：
   - 如果直接用 48 题平均值当总分，模型哪怕在 10 个极端难组上摆烂，靠 38 个简单组也能拿高分；因此必须按机制组先做 **70% 均值 + 30% 最坏 25% 尾部均值（CVaR-25）**，跨组再按 **75% 组均值 + 25% 最差组损失** 聚合：

$$\text{group\_loss}_g = 0.70 \times \text{mean}(\ell_{\text{case}}) + 0.30 \times \text{mean}\big(\text{top } 25\%\text{ worst }\ell_{\text{case}}\big)$$

$$\text{raw\_loss} = 0.75 \times \text{mean}_g(\text{group\_loss}_g) + 0.25 \times \max_g(\text{group\_loss}_g)$$

   - 硬可行性约束必须对 **48/48 全部工况** 执行严格检查（最大违约量 `max_ex <= 1e-7`）。只要出现哪怕 1 个工况违背安全边界（例如磁芯热失控发散、燃料电池单池欠压熄火、吸声器件超厚超重），整个分支直接输出 `feasible = False, reward = 0.0`——**同时在 `selfcheck.py` 诊断打印中把各机制组最差余量和违约数量吐给模型看**，让真正优秀的 Agent 在几个小时调试里自己学会“先保 `48/48` 可行包络，再向极小损失推进”。

---

## 第五章 Step 4：决定题目生死的工艺核心——6 档本地校准与临场微调

这道题上线后到底能不能稳定测出不同代差模型的实力，**90% 取决于你在写完题目、准备上线前的本地校准阶梯是否跑全。**

### 5.1 为什么一定要自己写一个 `Strong_Proxy` 来“攻击”自己的题？

只写一个 30 行的保守 `Baseline` 和一个自己手写的 `Author Reference`，是绝大多数出题人翻车的起点。现实情况是：**中等偏强一点的自主编程 Agent 在沙盒里跑几个小时后，实际水平常常比作者手写的基础 `Basic_Proxy` 还要高出 1.44 倍到 2.44 倍！**

因此，在把任何一道工程题定稿前，必须跑通 **6 档（含 `Strong_Proxy` 压测与 `Oracle_Headroom` 检验）本地实测阶梯**：

| 标定档位 | 模拟对象与真实代码构造策略 | 48/48 可行率门禁 | Hidden 归一化得分锚定区间 | 这道门禁实际帮你挡掉什么坑 |
|---|---|---|---|---|
| **0. `Baseline`** | `environment/methods/main/method.py`：合法但偏保守的工程默认值（例如取稳妥大规格器件、安全冗余余量打满） | **48/48**（且 `min_margin > 0`） | 锚定 **`0.0000`**（耗时 `< 5s/split`） | 杜绝用毫无常识的“摆烂零策略”做基准，否则随便写几行优化都能白拿高分 |
| **1. `Unrobust_Greedy`** | **无不确定性盲目贪心求解器**：直接按点估计或名义均值解优化，不考虑后验协方差安全盒 | **必须大面积挂科（`< 40/48`，理想 `15–35/48`）** | **`0.0000`（不可行淘汰）** | 用硬数据证明：如果不建不确定性分布、不做鲁棒安全包络，在真实工程硬约束面前寸步难行 |
| **2. `NoQuery / NoDiag`** | 同样采用强先验鲁棒优化，但 **0 次调用付费诊断测试** | **48/48 全过** | **`≤ 0.22`** | 验证你设计的台架查询和在线诊断确实携带高信息价值（VoI $\ge 0.38$），不是摆设 |
| **3. `Basic_Proxy`** | 固定选两个普通测试点 + 简单点拟合 + 固定保守安全边际 | **48/48 全过** | **`[0.12, 0.24]`** | 建立初级基线分化线（要求至少落后 Reference `≥ +0.36`） |
| **3.5 `Strong_Proxy`（生死闸门！）** | **模拟常规大模型极限水平**：向量化物理仿真副本 + 多起点 LM 非线性拟合 + `1.5×` 经验训练残差包络 + 贪心设计搜索（控制题则写 500 行多规则锁存状态机） | **48/48 全过** | **`≤ 0.32`**（最宽容忍天花板 **`≤ 0.36`**） | **上线前直接拦截“Easy-LM 陷阱”！** 确保与 Reference 之间有 `≥ +0.28` 实打实的机械护城河 |
| **4. `Author_Reference`** | 序列/自适应贝叶斯 VoI 选点 + 粒子/拉普拉斯后验采样云 + 鲁棒联合设计 / MPC | **48/48 全过** | 锚定 **`0.6000`**（耗时 `≤ 25s/split`） | 作为 `0.60` 锚定基准，既代表高水平一阶物理方案，又绝不把所有优化空间榨干 |
| **5. `Oracle_Headroom`** | 全信息潜变量神谕解（或更高密度的采样与深层非线性规划） | **48/48 全过** | 原始损失比 Reference 再低 **`15%–25%`** | 验证前沿长程强推理 Agent 有清晰可爬坡的空间（真实跑分落在硬核但非饱和的 `~0.50–0.72` 甜区，避免与噪声地板粘连） |

其中线性锚定归一化计分函数（`score_norm.py`）定义清晰简洁：令同版本 `Baseline` 在隐藏集上的原始损失为 $B$，池化最优合法参考上界 $A = \min(L_{\text{cand}}, R_{\text{ref}})$（确保得分在 `[0.0, 1.0]` 区间线性平滑且超越作者参考解依然可得额外线性正激励）：

```python
def normalize_score(raw_loss: float, baseline_loss: float, reference_loss: float, lower_is_better: bool = True) -> float:
    L, B, A = float(raw_loss), float(baseline_loss), float(reference_loss)
    if not (math.isfinite(L) and math.isfinite(B) and math.isfinite(A)):
        return 0.0
    denom = (B - A) if lower_is_better else (A - B)
    if denom <= 0.0:
        raise ValueError(f"degenerate anchors: baseline={B}, reference={A}")
    val = 0.60 * ((B - L) if lower_is_better else (L - B)) / denom
    return max(0.0, min(1.0, val))
```

### 5.2 真实数据集上的量化标定参考（5 题开源实测矩阵）

把上述方法完整落到第 2 章列出的 5 套开源真实实验数据源题目上，我们在本地完整 `grade.py` 严苛模式（48/48 全过要求）下获得的实测梯度数据如下表（可见 `Strong_Proxy` 全部被稳稳压在 `0.18–0.40` 区间，既真实模拟了强数值逼近能力，又为 `Author Reference (0.60)` 与更强深度推理留足了清晰的工程跃升梯度）：

| 开源实验题目 | Visible 原始损失<br>(`Base / Ctrl / Ref`) | Hidden 原始损失<br>(`Base / Ctrl / Ref`) | 强局部控制代理 `Strong_Proxy` Hidden 得分 | `Author_Reference` Hidden 锚点得分 | 48/48 门禁与单调性 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`OptiCoat_R1`**（多层光学镀膜） | `0.2045 / 0.1268 / 0.0712` | `0.1814 / 0.1207 / 0.0762` | `0.3464` | `0.6000` | PASS |
| **`YawWake_R1`**（风机偏航尾流） | `0.1888 / 0.1052 / 0.0601` | `0.1997 / 0.1162 / 0.0749` | `0.4011` | `0.6000` | PASS |
| **`FerriteLoop_R1`**（高频磁芯损耗） | `0.5327 / 0.3484 / 0.1198` | `0.6518 / 0.4657 / 0.1455` | **`0.2205`** | `0.6000` | PASS |
| **`AcoustiPorous_R1`**（多孔JCA声学） | `0.3867 / 0.3376 / 0.2420` | `0.4086 / 0.3678 / 0.2780` | **`0.1877`** | `0.6000` | PASS |
| **`PEMStack_R1`**（PEM燃料电池） | `1.3947 / 1.0720 / 0.5269` | `2.8768 / 2.2089 / 0.9184` | **`0.2046`** | `0.6000` | PASS |

### 5.3 出现数值走样怎么办？6 条“临场微调（Micro-Tuning）”急救决策树

真正的一线出题几乎不可能靠写一稿公式直接对齐全部 6 档指标，核心功力全在**跑完一轮本地校准研究表后立刻对症改物理旋钮**：

1. **警报 1：`Strong_Proxy > 0.38`（弱模型会顺着捷径贴脸打平！）**
   - *若是反演/设计题*：加大台架测量随机噪声标准差、把多频点长数组读数压缩为 3–5 个耦合带通标量，或将某个未观测潜变量与热阻/泄漏参数乘积耦合进同一条诊断读数，扩大 LM 单点估计的零空间协方差；同时强化离散选型与非线性平衡点之间的互斥耦合。
   - *若是闭环控制题*：收紧执行器速率限制（Slew Rate），放大两条混淆故障支路在边界区间误判时的单步惩罚系数，并提高未来阶跃负荷的持续长度，使短视的阈值规则状态机在未预见拐点处失守，凸显预测控制（MPC）的多步前瞻优势。
2. **警报 2：`Unrobust_Greedy` 居然侥幸通过 `≥ 44/48`（不确定性变成装饰品）**
   - 直接收紧 `2–3` 个决定物理生死的极限边界阈值（如最高结温上限 $T_{\max}$、最低单池电压保护下限 $U_{\min}$、低频吸声谷值保底 $\alpha_{\text{notch}}$ 或热失控安全余量），或放大外层边界族中的批次随机不确定性方差，直到忽略不确定性的名义方案精准跌落到 `15–35/48` 挂科。
3. **警报 3：`Abl_NoAdapt < 0.08`（存在“万能固定 2 测试组合”通吃全局）**
   - 立刻重设 Query #1 为分诊探针，把 4–6 类故障机制分别拆绑到互相正交、不能同时覆盖的专精复测接口上，保证任意硬写死的 2 个固定查询在至少 `2` 个机制组上留下巨大盲区（消融掉分必须 `≥ 0.08–0.15`）。
4. **警报 4：`Baseline` 或 `Reference` 意外撞出 `47/48`（1 个离群样本砸盘）**
   - 打印该样本的潜变量向量与失守的约束项：若是 3 个以上极端特征同时叠加引发的非物理极端事件，将产线潜变量采样截断收紧回 $\pm 1.7\sigma \sim 1.9\sigma$，**切勿动摇或放宽硬可行性门禁判定标准（始终保持 `ex <= 1e-7`）**。
5. **警报 5：有任何一项机制消融（`≥ 4` 项必做）掉分 `< 0.05`**
   - 说明你在题目宣传里重点强调的那个物理现象（比如边缘挤压效应或弛豫衰减项）在数值计算里其实处于“无量纲沉睡”状态，立刻调整无量纲激励幅值或成本权重，确保每一个物理机制都能实打实贡献 `≥ 0.05` 区分度。
6. **警报 6：`Reference` 与 `Oracle` 距离过窄或过宽**
   - 理想无偏留白区间为 `15%–25%`（即 `(R − L_oracle) / (B − R) ∈ [0.25, 0.55]`）。太窄则强模型和中等模型一起卡在物理地板上同分；太宽则强模型轻轻松松冲破 `0.90+` 导致归一化曲线饱和挤压。调强或适当调平衡 `Author_Reference` 后验精度即可把前沿强模型的实际落点稳稳控制在 **`0.50–0.72`** 的高辨识甜区。

---

## 第六章 Step 5：8 类负样本拒判、离线容器构建与交付前硬件自检

一套高质量工程题在送进离线 Docker 容器沙盒跑正式多小时评测之前，最后 10 分钟必须跑通以下全部工程级冒烟核验：

### 6.1 负样本拒判单元测试（全部 `feasible=False, reward=0.0`）
任何不按规矩出牌的恶意/残缺提交，评测脚本都必须优雅捕获异常、干净退出（返回码可审计）并把成绩严格清零：
1. `nop`：直接输出固定常数的空实现；
2. `infeasible`：刻意越过工程安全包络的激进违规解；
3. `over_budget_query`：强行在单工况内申请超过 `max_queries` 的诊断次数；
4. `invalid_query_id`：向引擎发送不存在的脏查询名；
5. `bad_schema`：缺少必选输出字段、输出 `NaN`/`Inf` 或错误数据类型；
6. `latent_peek_attempt`：尝试从案例对象读取 `_latent`、`_query_seed`、`group` 等私有属性；
7. `incomplete_episode`（因果控制题专属）：未走完规定步数提前中止序列控制；
8. `future_peek`（因果控制题专属）：试图读取未来尚未到达的时间步负载信息。

### 6.2 发布前终极 6 条上线核验清单

1. **纯离线容器构建烟雾测试**：在 `--network none --pull=false` 下仅依赖事先缓存进镜像的离线 Python `cp312` wheels（`numpy`、`scipy`、`numba`、`scikit-learn` 等锁死版本）完成构建，并在容器内部实跑 `Baseline (0.0000)`、`Author Reference (0.6000)` 与 `Nop (0.0000)`，三者必须一次跑通。
2. **纯洁包零泄露独立复跑**：把给 Agent 看的工作区目录单独打一个公开版压缩包，解压到一个**完全没有 `tests/` 目录的干净空目录下**，直接运行 `python methods/selfcheck.py --split visible`，确认 `48/48` 可行且 `score = 0.0000` 流畅出分，全目录检索不到任何 Hidden 数值锚点、作者策略暗示或对比模型名词。
3. **跨环境字节级镜像一致**：确认 `engine/task_model.py` 与 `tests/task_model.py`、`engine/evaluator.py` 与 `tests/evaluator.py`、`data/train/*` 与 `tests/fixtures/train/*` 的 SHA-256 完全一模一样，同时校验 `FIXTURE_SHA256.json` 在被刻意改坏 1 个字节时会准确抛出哈希篡改告警。
4. **纯 LF 行尾**：在 Windows 下编写好 `tests/test.sh` 等启动脚本后，一定要转换为纯粹的 `\n`（LF）换行符，否则进了 Linux Docker 容器第一句就会报 `/bin/bash^M: bad interpreter` 崩溃。
5. **自检速度压进 `1–25` 秒**：尽可能用 NumPy 向量化替代纯 Python 嵌套 `for` 循环，确保单次 `selfcheck.py` 能在 `1–5 秒`（Baseline）至 `≤ 25 秒`（Reference）跑完。只有极快的单轮反馈周期，才能支撑顶尖长程 Agent 在 7 小时预算里真正跑满上百轮“假设-消融-重构”科学迭代。
6. **诚实文档化披露**：在 `DATA_CARD.json`、`SOURCE_CARD.md` 与 `instruction.md` 里清晰划分实验测量真值、公开物理模拟扩展和各自适用限制——好的基准既要考得住最强模型，也要经得起同行和后来者的开源复现。

---

## 结语

总结起来，当下热潮滚滚的**“专家出题”**，其实正在把原本靠灵感、靠拍脑袋的出题，变成一门结合了**真实物理机制建模 × 对抗性计算机沙盒工程 × 统计不确定性标定**的硬核工程学。

当你手里既握有真实可查的一手工业/科研数据底座，又能运用“低信噪比付费诊断 + 冲突分支 + `stdin/stdout JSON-RPC` 隔离 + `Strong_Proxy` 压测”把题目的含金量死死锁住时，你产出就不再是一份用完即焚的普通试题，而是足以沉淀为高质量学术基准乃至驱动新一代科研智能体演进的硬通货。
