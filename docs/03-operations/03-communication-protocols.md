# Communication protocols

The chain from decision to acknowledged action. Content principles are in [warning §3](../00-foundations/07-warning-and-emergency-management.md); authority in [decision rights](../02-stakeholders/02-decision-rights-raci.md).

**The structural rule that prevents the most common real-world failure:**

> **All channel messages are generated from one decision record. Nobody hand-writes a per-channel variant.** Channels therefore cannot contradict each other, because there is only one source of numbers. This solves [failure library §3 #11](../00-foundations/10-failure-library.md) by construction rather than by discipline.

---

## 1. Notification matrix

| Event | Plant | Dam safety | Authority | Communes | Emergency svcs | Dispatch | Media | Public | Lead required |
|---|---|---|---|---|---|---|---|---|---|
| Operating mode → flood watch | ✔ | I | I | – | – | I | – | – | – |
| Pre-release proposed | ✔ | C | **✔ decide** | I | I | I | – | – | at proposal |
| Pre-release approved | ✔ | I | ✔ | **✔** | ✔ | ✔ | I | **✔** | **≥ 2 h before** ⚠ |
| Spill increase | ✔ | ✔ | ✔ | **✔** | ✔ | ✔ | ✔ | **✔** | **≥ 2 h before** ⚠ |
| Above ceiling | ✔ | ✔ | ✔ | I | – | I | – | I | immediate |
| BĐ1 crossed | I | – | ✔ | ✔ | I | – | I | ✔ | immediate |
| BĐ2 crossed | ✔ | I | ✔ | ✔ | ✔ | I | ✔ | ✔ | immediate |
| BĐ3 crossed | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | immediate |
| Pass-through imminent | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✔** | **as soon as unavoidable** |
| Evacuation order | ✔ | I | ✔ | ✔ | ✔ | I | ✔ | ✔ | immediate |
| Road/bridge closure | I | – | ✔ | ✔ | ✔ | – | ✔ | ✔ | immediate |
| EAP L1 | ✔ | ✔ | I | – | – | – | – | – | immediate |
| EAP L2 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | I | I | immediate |
| **EAP L3 / breach** ⚠ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✔ ALL CHANNELS AT ONCE** | **none — pre-authorised** |
| Data degradation L2+ | ✔ | ✔ | ✔ | – | – | – | – | – | immediate |
| All-clear | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | – |

`✔` recipient · `C` consulted · `I` informed

---

## 2. Channels

| Channel | Reach | Latency | Reliability in a typhoon | Best for |
|---|---|---|---|---|
| **Phone call** | 1 person | seconds | Medium (network congestion) | Authority chain, acknowledgement |
| **SMS** | Mass | seconds–minutes | Medium; survives weak signal | Short public warnings |
| **Zalo / messaging** | Mass, high VN penetration | seconds | Needs data | Rich content, maps, updates |
| **Cell broadcast** (if available) | All handsets in an area | seconds | High; no congestion | Life-safety alerts |
| **Siren** | Local | immediate | High (needs backup power) | Immediate evacuation |
| **Loudspeaker (loa phường/xã)** | Local, **very high trust in VN** | minutes | High | Detailed local instruction |
| **Door-knock** | Household | hours | Highest | Night, vulnerable households, non-responders |
| **Radio / TV** | Regional | minutes | High | Wide awareness |
| **App / web** | Self-serve | seconds | Needs data | Detail, verification, maps |
| **CAP feed** | Machine | seconds | High | Automatic redistribution to other systems |
| **Fax/official letter** | Institutional | hours | High | Legal record `⚠ still required in some chains` |

**Rules.**
1. **Never rely on one channel.** Every ≥ L2 notification goes on ≥ 3, including one that works without data connectivity.
2. **Loudspeaker and door-knock are the last mile in rural Vietnam.** Design the product to produce a **printed/readable script** for them, not just a digital push.
3. **Night events require loud channels.** Reception at 03:00 via app notification is near zero.
4. **Acknowledgement, not delivery, closes the loop.**

---

## 3. Message templates

All rendered from the decision record. Placeholders are bound, never typed.

### 3.1 Phone script (≤ 20 seconds — the format that actually gets used)
```
[STATION/PLANT] to [RECIPIENT], [HH:MM] [DD/MM].
[RESERVOIR] will increase release from [Q0] to [Q1] m³/s starting [HH:MM].
Expected at [CONTROL POINT] around [HH:MM], level about [H] m, that is [ABOVE/BELOW]
alert level [BĐn] by [X] m.
Please confirm receipt.
```

### 3.2 SMS / cell broadcast (≤ 160 characters)
```
CANH BAO LU [COMMUNE]: nuoc song len [H]m (tren BD[n] [X]m) tu [HH:MM] [DD/MM].
Ngap sau ~[D]m. Di chuyen den [SHELTER]. Duong [ROAD] dong luc [HH:MM]. [ISSUER]
```
*(unaccented for maximum device compatibility; the accented version goes to Zalo/app)*

### 3.3 Loudspeaker script (commune, read aloud, ~45 s)
```
Thông báo khẩn của Ban Chỉ huy PCTT&TKCN [ĐƠN VỊ].
Hồ [HỒ] sẽ tăng lưu lượng xả từ [Q0] lên [Q1] m³/s bắt đầu lúc [HH:MM] ngày [DD/MM].
Mực nước sông tại [TRẠM] dự kiến lên [H] mét, trên báo động [n] khoảng [X] mét
vào khoảng [HH:MM].
Các thôn [DANH SÁCH] có khả năng ngập sâu khoảng [D] mét.
Đề nghị bà con: kê cao tài sản, di chuyển người già, trẻ em, người bệnh
đến [ĐIỂM SƠ TÁN] trước [HH:MM].
Tuyến đường [ĐƯỜNG] dự kiến ngập, không đi qua sau [HH:MM].
Mọi thông tin cập nhật tại [KÊNH]. Xin nhắc lại…
```

### 3.4 Public plain-language card (app/web)
```
Your area: [WARD/COMMUNE]
Water is expected to reach your area between [HH:MM] and [HH:MM] tonight.
Expected depth: about [D] m — [above/below] the floor of most single-storey houses.
What to do: [ACTION]
Where to go: [SHELTER], [DISTANCE] km, via [ROUTE] — open until about [HH:MM]
Who is telling you this: [ISSUER]  ·  Next update: [HH:MM]
How sure are we: [likely / possible] — [why]
```

### 3.5 CAP alert (machine)
Fields: `identifier, sender, sent, status, msgType, scope, category=Met, event, urgency, severity, certainty, effective, onset, expires, senderName, headline, description, instruction, area(polygon), parameter(depth, stage, BĐ level)`.

### 3.6 Decision package (one page, for signature)
```
DECISION PACKAGE #[ID]           [HH:MM DD/MM]   Escalation: [L]   Data: [L0–L4]
SITUATION   [2 lines: forecast, current state, controllability κ]
PROPOSAL    [Reservoir] [Q0→Q1] m³/s from [HH:MM], ramp [R] m³/s/h,
            gates [config], until [end condition]
CONSTRAINTS [list, each PASS/FAIL/MARGINAL with margin; binding constraint named]
OUTCOME     Peak at [control point]: [H] m (q50), [q10–q90] band — vs [H'] if no action
IMPACT      [people] exposed, [homes], roads [list], zones [list]
ALTERNATIVES [2–3, each with its trade-off]
REGRET      If we act and the storm misses: [...]   If we wait and it comes: [...]
CONFIDENCE  [HIGH/MED/LOW] because [...]
DEADLINE    Decide by [HH:MM] (notification lead [X] h + approval [Y] h)
DECISION    ☐ Approve  ☐ Modify: ______  ☐ Reject  ☐ Defer to [HH:MM]
REASON      _________________________________________________
SIGNED      __________________  [name, role, time]
```

---

## 4. Acknowledgement and escalation

```
Send → delivered? ──NO (⟨5 min⟩)──► retry on next channel
   │
  YES
   ▼
acknowledged? ──NO (⟨10 min⟩)──► automatic phone call to primary contact
   │                          ──NO (⟨20 min⟩)──► call backup contact
  YES                         ──NO (⟨30 min⟩)──► escalate to the level above,
   ▼                                              record as UNACKNOWLEDGED ⚠
 closed                                           (this becomes an inquiry finding)
```

**Every commune contact has at least one backup.** A contact tree with single points of failure is a defect, and the product should refuse to mark an EAP as valid without backups.

---

## 5. Public information cadence

| Escalation | Update frequency | Content |
|---|---|---|
| L1 Watch | Daily | Situation, outlook, "no action needed" |
| L2 Alert | Every 3 h | Forecast, reservoir state, what may happen |
| L3 Emergency | **Hourly, even if unchanged** | Current, next 6 h, actions, routes, shelters |
| L4 Disaster | Every 30 min | Evacuation status, rescue, isolated areas |
| Recovery | Daily | All-clear, return guidance, support |

**"No change" updates are mandatory.** Silence is read as either safety or concealment. Both are dangerous.

---

## 6. The three messages the product must make easy

1. **"The dam is now passing the flood, not reducing it."** Honest, early, and it pre-empts the blame argument.
2. **"We released early; the storm turned away; here is what that cost and why we would do it again."** The false-alarm explanation is the single highest-return trust investment available.
3. **"This flooding is from local rain, not from reservoir releases — here is the evidence."** Requires the pluvial/fluvial split ([hydraulics §7](../00-foundations/03-hydraulics-and-routing.md)) and the publishable operation record.

---

## 7. Language and accessibility

- Vietnamese primary; English secondary for tourists and international agencies (Hội An).
- **Unaccented Vietnamese fallback** for SMS/legacy devices.
- Reading level: aim at lower-secondary. No jargon without a plain-language gloss.
- Numbers with a reference: *"0.8 m — about waist-deep, above the floor of most houses here"*.
- Landmarks, not coordinates.
- Audio for low-literacy and visually impaired audiences.
- Consistent structure so repeated exposure builds comprehension.

---

## 8. Reference implementation status

| Element | Status |
|---|---|
| Event log with BĐ crossings | ✅ |
| Toast notifications for zone escalation | ✅ |
| Situation report print | ⚠ exists; not a decision package |
| Message generation from a decision record | ❌ **P0** |
| Channel variants | ❌ |
| Acknowledgement tracking | ❌ |
| Public view | ❌ |
| CAP output | ❌ |
| False-alarm explanation flow | ❌ |

---

**Next:** [Decision engine specification →](../04-decision-support/01-decision-engine-spec.md)
