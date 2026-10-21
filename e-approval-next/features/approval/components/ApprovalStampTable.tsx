import type { ApprovalLine, Approver, DocumentStatus } from '../types'
import { formatDate } from '../utils'

interface Props {
  writer: Approver
  submittedAt: string | null
  status: DocumentStatus
  lines: ApprovalLine[]
}

/** 종이 결재 문서의 "결재란"처럼 직책 / 이름(도장) / 날짜를 칸으로 보여준다 */
export default function ApprovalStampTable({ writer, submittedAt, status, lines }: Props) {
  return (
    <table className="apv-stamp-table">
      <tbody>
        <tr>
          <th rowSpan={3} className="apv-stamp-head">
            결<br />재
          </th>
          <td className="apv-stamp-pos">기안</td>
          {lines.map((l) => (
            <td key={l.stepOrder} className="apv-stamp-pos">
              {l.approver.positionLabel}
            </td>
          ))}
        </tr>
        <tr>
          <td className="apv-stamp-sign">
            {status !== 'DRAFT' ? <span className="apv-stamp apv-stamp--writer">{writer.name}</span> : writer.name}
          </td>
          {lines.map((l) => (
            <td key={l.stepOrder} className={`apv-stamp-sign apv-stamp-sign--${l.status.toLowerCase()}`}>
              {l.status === 'APPROVED' && <span className="apv-stamp">승인</span>}
              {l.status === 'REJECTED' && <span className="apv-stamp apv-stamp--rejected">반려</span>}
              <div>{l.approver.name}</div>
              {l.status === 'CURRENT' && <small className="apv-stamp-current">결재 차례</small>}
            </td>
          ))}
        </tr>
        <tr>
          <td className="apv-stamp-date">{status === 'DRAFT' ? '-' : formatDate(submittedAt)}</td>
          {lines.map((l) => (
            <td key={l.stepOrder} className="apv-stamp-date">
              {formatDate(l.actedAt)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
