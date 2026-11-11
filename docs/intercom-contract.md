# Intercom: what a door call needs from an integration

The dashboard's door call (`app/doorcall.js`) knows no brand. It works with whatever the administrator binds to a camera's intercom profile (Settings, the camera, Intercom: answer, reject, unlock, call indicator) and with two optional audio paths that the **call indicator** publishes. An integration that does both gets the same popup as any other.

## The call indicator (`ix.ring`)

An entity whose state says whether someone is calling:

| Domain | Reads as |
| --- | --- |
| `sensor` | `idle` (also `off`, `none`, `0`, empty, `unknown`, `unavailable`): no call. A state containing `ring`: ringing. Any other state: a call in progress (answered). |
| `binary_sensor`, `input_boolean` | `on`: ringing, until it is off. |
| `event` | fired in the last 30 seconds: ringing. |

Only a `sensor` can tell ringing from answered; the others ring until they stop, and an answer given on the dashboard counts at once.

## What the popup does

- A call opens the popup on every open dashboard, over whatever is open; a dashboard opened while a call is going opens it too (the notification of a call opens the dashboard when it is tapped). Closing the popup during a call means "not now": it stays closed until that call is over.
- It shows the camera (with only a mute button: no full screen, no settings), then **Answer** (green) and **Decline** (red) side by side, and the **slide to unlock** (the unlock entity, the dashboard's own slide) with some room under it so that sliding does not meet the phone's gesture at the bottom edge. It closes itself shortly after the call ends.
- Pressing **Answer** takes the call with sound both ways at once (the page was just tapped, which the browser needs for the microphone): the door is played from `listen_path` and the microphone goes to `talk_path`, where they exist. Decline then becomes **End call**: the label changes and the button grows to the full width while Answer fades out. The mute button of the picture silences the door; there are no talk or listen buttons.
- The slide to unlock is shown while a call rings or goes on and an unlock entity is bound, unless the call indicator has the attribute `can_unlock` and it is `false`: that caller has no door (a guard desk), so there is nothing to unlock. An indicator without the attribute leaves the unlock available.
- Access follows the dashboard's own rules (hidden, view only, confirm) for the camera; it does not need an administrator.

## What the indicator may say about the caller

| Attribute | Meaning |
| --- | --- |
| `can_unlock` | `false` while the call that rings or goes on comes from a caller with no door to open (a guard desk); `true` or absent otherwise. Publish it only while a call is going. |

## Audio (attributes of the call indicator)

| Attribute | Address | Direction |
| --- | --- | --- |
| `listen_path` | an `/api/...` path of Home Assistant | `GET`, a live `audio/wav` stream of the door (16-bit mono PCM; the sample rate is in the header). Played by an audio element from a path signed with `auth/sign_path`. |
| `talk_path` | an `/api/...` path of Home Assistant | A WebSocket, opened on a path signed with `auth/sign_path`. The dashboard sends binary messages of **16 kHz, 16-bit, little-endian, mono PCM** (what Assist uses). The line may send one text message `{"error": "<code>"}` before it closes (`no_call`, `busy`, `station_offline`, `app_unreachable` get a sentence; any other code says talking stopped). |

Both are accepted only as an `/api/` path with no `..`; an address anywhere else is ignored. The profile's own `ix.listen` (a path) overrides `listen_path`.

Where the page may not use a microphone (plain `http` other than localhost: a browser refuses `getUserMedia` there and no page can change that) answering opens Home Assistant's own Assist when the phone app shows the page (its native microphone does not need https); with a voice assistant whose speech-to-text is the integration's microphone entity, what is said reaches the door. Elsewhere it says that talking needs https; listening, answering and unlocking work on http.

## The authors of the audio paths

They decide who may use them (Hikvision Intercom lets any signed-in user), and must only open the voice channel while a call is going.
