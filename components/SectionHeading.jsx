import InfoHint from "@/components/InfoHint";

/**
 * Compact card heading: a title, an optional one-line subtitle, detail tucked
 * into an info hint, and right-aligned actions.
 */
export default function SectionHeading({ title, id, sub = null, hint = null, children = null, level = 2 }) {
  const Heading = `h${level}`;
  return (
    <div className="kleos-section-head">
      <div className="section-header">
        <div className="kleos-title-row">
          <Heading id={id}>{title}</Heading>
          {hint ? <InfoHint label={typeof title === "string" ? `About ${title}` : "More information"}>{hint}</InfoHint> : null}
        </div>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="kleos-actions">{children}</div> : null}
    </div>
  );
}
