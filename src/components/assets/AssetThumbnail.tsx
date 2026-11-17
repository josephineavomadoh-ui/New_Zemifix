'use client';

import React, { useState } from 'react';
import { Wrench, Boxes } from 'lucide-react';

interface AssetThumbnailProps {
  assetId: string;
  imageUrl?: string | null;
  assetName?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const AssetThumbnail: React.FC<AssetThumbnailProps> = ({
  assetId,
  imageUrl,
  assetName = 'Asset',
  size = 'md',
}) => {
  const [hasError, setHasError] = useState(false);

  const dimensionClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-base',
  }[size];

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8',
  }[size];

  if (!imageUrl || hasError) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 ${dimensionClasses}`}
        title={assetName}
      >
        <Wrench className={iconSizes} />
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${dimensionClasses}`}>
      <img
        src={`/api/assets/${assetId}/image`}
        alt={assetName}
        onError={() => setHasError(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
};
