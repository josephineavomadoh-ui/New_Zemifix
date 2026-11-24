import React from 'react';

/**
 * Simple workspace selector – renders a button for each permitted workspace.
 * `onSelect` receives the workspace key chosen by the user.
 */
export const WorkspaceSelector: React.FC<{
  workspaces: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}> = ({ workspaces, selected, onSelect }) => {
  return (
    <div className="flex space-x-2 mb-4">
      {workspaces.map((ws) => (
        <button
          key={ws.key}
          onClick={() => onSelect(ws.key)}
          className={`px-4 py-2 rounded ${
            selected === ws.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
          }`}
        >
          {ws.label}
        </button>
      ))}
    </div>
  );
};
