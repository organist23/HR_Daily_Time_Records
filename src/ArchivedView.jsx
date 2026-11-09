// Archived offices and employees, each with Restore and Delete.
// Employees of an archived office are listed under that office, not one by one.
export default function ArchivedView({ data, onRestore, onDeleteOffice, onDeleteEmployee }) {
  const offices = Object.keys(data.offices).filter((o) => data.offices[o].archived).sort();
  const staffCount = (office) => Object.values(data.employees).filter((e) => e.office === office).length;
  const employees = Object.values(data.employees)
    .filter((e) => e.archived && !data.offices[e.office]?.archived)
    .sort((a, b) => (a.office < b.office ? -1 : a.office > b.office ? 1 : a.name.localeCompare(b.name)));

  return (
    <section className="archived-view holiday-list" aria-label="Archived">
      <h2>Archived offices</h2>
      {offices.length === 0 ? <p className="muted">No archived offices.</p> : (
        <ul>
          {offices.map((o) => (
            <li key={o}>
              <span>{o} <span className="muted">({staffCount(o)} employees)</span></span>
              <span className="row-actions">
                <button onClick={() => onRestore({ office: o }, `office ${o}`)} aria-label={`Restore office ${o}`}>Restore</button>
                <button className="danger" onClick={() => onDeleteOffice(o)} aria-label={`Delete office ${o}`}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h2>Archived employees</h2>
      {employees.length === 0 ? <p className="muted">No archived employees.</p> : (
        <ul>
          {employees.map((e) => {
            const label = `${e.name} (#${e.acNo})`;
            return (
              <li key={`${e.office}|${e.acNo}`}>
                <span>{label} <span className="muted">{e.office}</span></span>
                <span className="row-actions">
                  <button onClick={() => onRestore({ office: e.office, acNo: e.acNo }, label)} aria-label={`Restore ${label}`}>Restore</button>
                  <button className="danger" onClick={() => onDeleteEmployee(e)} aria-label={`Delete ${label}`}>Delete</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
