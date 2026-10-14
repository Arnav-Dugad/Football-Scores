import { useApp } from "../lib/state";
import { leagues } from "../../shared/model";
import { Title, DataGate, Table, Metrics } from "../components/UI";
export default function Standings() {
  const { data, league, season } = useApp();
  const l = leagues.find((x) => x.id === league)!;
  return (
    <>
      <Title
        eyebrow="THE SEASON AT A GLANCE"
        title={`${l.name} table`}
        description={`${season} · Every point tells a story.`}
      />
      <DataGate>
        <Metrics
          items={[
            { label: "Clubs", value: data?.standings.length ?? 0 },
            {
              label: "Completed matches",
              value:
                data?.matches.filter((m) => m.status === "finished").length ??
                0,
            },
            {
              label: "Leader points",
              value: data?.standings[0]?.points ?? "–",
            },
            {
              label: "Data coverage",
              value: "Recorded",
              detail: "Based on supplied results",
            },
          ]}
        />
        <div className="panel table-panel">
          <Table rows={data?.standings ?? []} />
        </div>
        <div className="methodology panel">
          <h3>How this table works</h3>
          <p>
            Three points for a win, one for a draw. Ordered by points, goal
            difference, then goals scored; alphabetical order breaks any
            remaining ties. This is a calculated table from recorded results,
            not an official league table. Point deductions, head-to-head
            tie-breaks, qualification places, and relegation rules are not
            applied.
          </p>
          <p>
            Last five form is chronological, oldest to newest. Missing results
            can change ranks. The match list is available in Scores.
          </p>
        </div>
      </DataGate>
    </>
  );
}
