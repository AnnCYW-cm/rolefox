# RoleFox 产品设计索引

本目录把“面试前 Autopilot”的愿景拆成可以验证、设计和开发的产品规格。文档描述的是目标版本，不代表当前 M0 已经实现。

## v0.1 产品包

- [产品需求文档](prd-v0.1.md)：用户、问题、范围、功能要求、指标与非目标
- [用户体验与信息架构](user-experience-v0.1.md)：首次配置、日常自治、异常处理和面试通知
- [P0 Case 验收基线](p0-case-baseline-v0.1.md)：254 条产品、安全与故障恢复 Given/When/Then Case
- [UML 设计基线](uml/README.md)：已接受的用例、领域、状态、活动、时序、组件、部署、安全和 Case 追踪
- [验证计划](validation-plan-v0.1.md)：关键假设、研究方法、实验信号与决策门
- [交付计划](delivery-plan-v0.1.md)：10 周纵向切片、验收标准、风险与止损规则
- [实现证据与发布闭合协议](implementation-verification-v0.1.md)：Case/Gate 证据登记、`Future/N/A` 治理、真实 Provider manifest 与 `release:check` 契约

## 已确认原则

1. RoleFox 的交付结果是合格且已确认的面试，不是岗位列表或投递数量。
2. 用户完成首次配置和校准后，授权范围内的流程不再需要逐项操作。
3. v0.1 用一条窄而完整的通道证明闭环，不以支持平台数量证明通用性。
4. 通用性来自领域模型、策略和连接器边界，不来自第一版功能堆叠。
5. 先用合成环境跑通完整闭环，再接真实读取，最后才验证真实外发动作。
6. 没有合规稳定的写入路径时，产品应降级为只读、材料导出和人工交接，不绕过平台限制。

产品北极星决策见 [ADR-0001](../adr/0001-pre-interview-autopilot.md)；v0.1 的 19 项已接受决策及完整稳定编号 `DEC-01`—`DEC-20`（`DEC-13` 保留并合并）见 [ADR-0002](../adr/0002-v0.1-product-decision-baseline.md)，安全控制的业务 Shadow 边界见 [ADR-0003](../adr/0003-shadow-safety-control-exceptions.md)，JD raw 清除后的准备包语义见 [ADR-0004](../adr/0004-jd-raw-retention-and-preparation-pack.md)，唯一维护者决策权及机器签名边界见 [ADR-0005](../adr/0005-sole-maintainer-governance.md)。五项新增产品判定及其机器发布条件见[实现证据与发布闭合协议](implementation-verification-v0.1.md)。
