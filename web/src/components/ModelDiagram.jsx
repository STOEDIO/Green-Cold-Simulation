const DAY = [
  ["Is a machine working today?", "The old machine breaks at some point in the first year. The new one, if bought, is ready from month 4."],
  ["What does the crew do?", "If stock is running low, two operators run the machine. Otherwise the crew builds hand panels for waiting projects."],
  ["Builders order", "They take panels from the store, which holds 2,000 m². If the store is empty, the sale is lost or bought in from a partner."],
  ["Projects order", "Each gets a delivery date based on the queue. If the wait would be over 24 days, the client goes elsewhere or we pass it to a partner."],
  ["End of the month", "Customers who got late or missing orders buy less next month. Some win-back happens over time."],
];

export default function ModelDiagram({ nSims, rows }) {
  const front = rows.filter((r) => r.pareto_level === 1).length;
  return (
    <>
      <ol className="flow" aria-label="What the simulation checks every working day">
        {DAY.map(([t, d], i) => (
          <li key={t} className="flow-step">
            <span className="flow-n">{i + 1}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ol>
      <p className="flow-repeat">This repeats for every working day: 22 a month, 528 over two years.</p>

      <div className="scale-row">
        <div><b>152</b><span>ways to run the plant: which investment, how many crews, how much stock, whether to use partners</span></div>
        <div><b>{nSims}</b><span>possible futures with different order patterns and breakdown dates, the same for every option so the comparison is fair</span></div>
        <div><b>4</b><span>things we score: value created, value in a bad year, on-time delivery for the weaker customer group, and share of orders served</span></div>
        <div><b>{front}</b><span>options that are not beaten on all four at once; we then rank everything under four different priorities</span></div>
      </div>
    </>
  );
}
