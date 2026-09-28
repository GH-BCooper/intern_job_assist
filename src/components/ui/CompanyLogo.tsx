import { useMemo, useState } from 'react';
import { avatarGradient, initials } from '../../lib/format';
import { logoSources } from '../../lib/logo';
import { usePreferences } from '../../hooks/useStore';

/**
 * A real company logo where one can be found, the existing gradient-initials
 * avatar where it cannot.
 *
 * Candidate URLs are tried in order and a failure simply advances the index, so
 * a 404 from a keyless logo service is the expected path, not an error.
 */
export default function CompanyLogo({
  name,
  size = 40,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const prefs = usePreferences();
  const sources = useMemo(() => (prefs.companyLogos ? logoSources(name) : []), [name, prefs.companyLogos]);
  const [index, setIndex] = useState(0);

  const src = sources[index]?.url;

  if (!src) {
    return (
      <span
        className={`rounded-xl bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 text-white font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.34 }}
        aria-hidden
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span
      className={`relative rounded-xl overflow-hidden flex-shrink-0 bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-700 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        key={src}
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        width={size}
        height={size}
        onError={() => setIndex(i => i + 1)}
        className="w-full h-full object-contain p-[12%]"
      />
    </span>
  );
}
