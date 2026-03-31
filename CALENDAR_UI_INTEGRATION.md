# Google Calendar UI Integration Instructions

## Add to src/app/dashboard/settings/page.tsx

### 1. Update TenantSettings interface (around line 27):

```typescript
interface TenantSettings {
  calendar_provider: string | null;
  google_connected?: boolean;
  google_calendar_id?: string | null;
  availability_settings: any | null;
}
```

### 2. Add Google Calendar disconnect handler (after fetchBusinessSettings function):

```typescript
async function handleDisconnectGoogle() {
  if (!confirm('Are you sure you want to disconnect Google Calendar? Existing appointments will remain in your calendar.')) {
    return;
  }
  
  setSaving(true);
  setMessage(null);
  
  try {
    const response = await fetch('/api/settings/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disconnect_google: true }),
    });
    
    if (!response.ok) throw new Error('Failed to disconnect');
    
    setMessage({ type: 'success', text: 'Google Calendar disconnected successfully' });
    await fetchSettings(); // Refresh settings
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar' });
  } finally {
    setSaving(false);
  }
}
```

### 3. Add Calendar tab button in navigation (around line 440, after AI Configuration button):

```typescript
<button
  onClick={() => setActiveTab('calendar')}
  className={`py-4 px-1 border-b-2 font-medium text-sm ${
    activeTab === 'calendar'
      ? 'border-blue-500 text-blue-600'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  }`}
>
  <Calendar className="inline h-4 w-4 mr-2" />
  Calendar
</button>
```

### 4. Add Calendar section content (after AI section, before Templates section):

```typescript
{/* Calendar Section */}
{activeTab === 'calendar' && (
  <div className="space-y-6">
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-green-600" />
          Google Calendar Integration
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Connect your Google Calendar to sync appointments automatically
        </p>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Connection Status */}
        <div className={`p-4 rounded-lg border-2 ${
          settings?.google_connected 
            ? 'bg-green-50 border-green-200' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings?.google_connected ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Google Calendar Connected</p>
                    <p className="text-sm text-green-700">
                      Calendar ID: {settings.google_calendar_id || 'primary'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">Not Connected</p>
                    <p className="text-sm text-gray-600">
                      Connect your Google Calendar to enable automatic appointment sync
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Features List */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-3">What you get:</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Automatic appointment sync (both ways)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Google Meet links auto-generated for all bookings</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Real-time availability checking via AI</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Calendar invites sent to customers automatically</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {settings?.google_connected ? (
            <button
              type="button"
              onClick={handleDisconnectGoogle}
              disabled={saving}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
              Disconnect Google Calendar
            </button>
          ) : (
            <a
              href="/api/auth/google-calendar"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M7,12C7,9.24 9.24,7 12,7C13.93,7 15.59,8.09 16.41,9.66L14.75,10.5C14.28,9.56 13.22,9 12,9C10.34,9 9,10.34 9,12C9,13.66 10.34,15 12,15C13.38,15 14.54,14.04 14.88,12.75H12V10.75H17C17.08,11.17 17.12,11.58 17.12,12C17.12,14.9 14.9,17.12 12,17.12C9.1,17.12 6.88,14.9 6.88,12H7Z" />
              </svg>
              Connect Google Calendar
            </a>
          )}
        </div>

        {/* Instructions */}
        {!settings?.google_connected && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">How to connect:</h3>
            <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
              <li>Click "Connect Google Calendar" above</li>
              <li>Sign in with your Google account</li>
              <li>Grant calendar permissions</li>
              <li>You'll be redirected back here with confirmation</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

## Quick Implementation

Since manual editing may be time-consuming, here's the complete Calendar section as a standalone component you can copy:

**File: src/app/dashboard/settings/CalendarSettings.tsx**

```typescript
'use client';

import { useState } from 'react';
import { Calendar, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface CalendarSettingsProps {
  settings: any;
  onRefresh: () => Promise<void>;
}

export default function CalendarSettings({ settings, onRefresh }: CalendarSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleDisconnectGoogle() {
    if (!confirm('Are you sure you want to disconnect Google Calendar? Existing appointments will remain in your calendar.')) {
      return;
    }
    
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect_google: true }),
      });
      
      if (!response.ok) throw new Error('Failed to disconnect');
      
      setMessage({ type: 'success', text: 'Google Calendar disconnected successfully' });
      await onRefresh();
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            Google Calendar Integration
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Connect your Google Calendar to sync appointments automatically
          </p>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg border-2 ${
            settings?.google_connected 
              ? 'bg-green-50 border-green-200' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              {settings?.google_connected ? (
                <>
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Google Calendar Connected</p>
                    <p className="text-sm text-green-700">
                      Calendar ID: {settings.google_calendar_id || 'primary'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900">Not Connected</p>
                    <p className="text-sm text-gray-600">
                      Connect your Google Calendar to enable automatic appointment sync
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Features */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3">What you get:</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Automatic appointment sync (both ways)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Google Meet links auto-generated</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Real-time availability checking</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Calendar invites sent automatically</span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {settings?.google_connected ? (
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                disabled={saving}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                Disconnect Google Calendar
              </button>
            ) : (
              <a
                href="/api/auth/google-calendar"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
              >
                <Calendar className="h-5 w-5" />
                Connect Google Calendar
              </a>
            )}
          </div>

          {!settings?.google_connected && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">How to connect:</h3>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li>Click "Connect Google Calendar" above</li>
                <li>Sign in with your Google account</li>
                <li>Grant calendar permissions</li>
                <li>You'll be redirected back with confirmation</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Then in your main settings page, import and use:

```typescript
import CalendarSettings from './CalendarSettings';

// In the render section:
{activeTab === 'calendar' && (
  <CalendarSettings settings={settings} onRefresh={fetchSettings} />
)}
```
