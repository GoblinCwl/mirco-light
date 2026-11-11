import {setupVisitorTracking} from './visitorRecording'
// Only real navigation records a visit; hover prefetch and fragment changes do not.
setupVisitorTracking()
