import CoreMotion
import ExpoModulesCore
import Foundation

private let stepUpdateEvent = "onStepUpdate"

private enum PrefKeys {
  static let sessionId = "wtt_pedometer_session_id"
  static let isRecording = "wtt_pedometer_is_recording"
  static let accumulatedSteps = "wtt_pedometer_accumulated_steps"
  static let activeSegmentStartMs = "wtt_pedometer_active_segment_start_ms"
  static let liveSegmentSteps = "wtt_pedometer_live_segment_steps"
  static let lastStepTimestampMs = "wtt_pedometer_last_step_timestamp_ms"
}

private struct PersistedState {
  var sessionId: String?
  var isRecording: Bool
  var accumulatedSteps: Int64
  var activeSegmentStartMs: Double
  var liveSegmentSteps: Int64
  var lastStepTimestampMs: Double
  var mutationGen: Int64

  var totalSteps: Int64 {
    return max(0, accumulatedSteps + liveSegmentSteps)
  }

  func toDictionary() -> [String: Any] {
    return [
      "sessionId": sessionId ?? NSNull(),
      "totalSteps": Double(totalSteps),
      "lastStepTimestampMs": lastStepTimestampMs,
      "isRecording": isRecording,
      "isForegroundServiceRunning": false
    ]
  }
}

internal struct StartPedometerSessionOptions: Record {
  @Field var sessionId: String = ""
  @Field var trackingMode: String = "indoor"
  @Field var useForegroundService: Bool = false
  @Field var notificationTitle: String = "Walk The Talk"
  @Field var notificationBody: String = ""
  @Field var notificationColor: String?
  @Field var strideMeters: Double = 0.9
  @Field var initialSyncedSteps: Int = 0
  @Field var stepsLabel: String = "langkah"
}

internal struct ResumePedometerSessionOptions: Record {
  @Field var trackingMode: String?
  @Field var useForegroundService: Bool?
  @Field var notificationTitle: String?
  @Field var notificationBody: String?
  @Field var notificationColor: String?
  @Field var strideMeters: Double?
}

public class WorkoutPedometerModule: Module {
  private let pedometer = CMPedometer()
  private let stateQueue = DispatchQueue(label: "expo.modules.workoutpedometer.ios.state")
  private var state = PersistedState(
    sessionId: nil,
    isRecording: false,
    accumulatedSteps: 0,
    activeSegmentStartMs: 0,
    liveSegmentSteps: 0,
    lastStepTimestampMs: 0,
    mutationGen: 0
  )
  private var isObservingUpdates = false

  public func definition() -> ModuleDefinition {
    Name("WorkoutPedometer")

    Events(stepUpdateEvent)

    OnCreate {
      self.stateQueue.sync {
        self.state = self.loadState()
      }
      self.startLiveUpdatesIfNeeded()
    }

    OnDestroy {
      self.stopLiveUpdates()
    }

    OnAppEntersBackground {
      // Stop live delivery before suspension; M-coprocessor continues recording natively
      // and will be reconciled via queryPedometerData on foreground/snapshot.
      self.stopLiveUpdates()
    }

    OnAppEntersForeground {
      self.reconcileActiveSegmentLocked(emitIfChanged: true, completion: nil)
      self.startLiveUpdatesIfNeeded()
    }

    AsyncFunction("isAvailableAsync") { () -> Bool in
      guard self.hasMotionUsageDescription() else {
        return false
      }
      return CMPedometer.isStepCountingAvailable()
    }

    AsyncFunction("getPermissionsAsync") { () -> [String: Any] in
      guard self.hasMotionUsageDescription() else {
        return self.permissionResult(status: "denied", canAskAgain: false)
      }
      return self.currentMotionPermissionResult()
    }

    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      guard self.hasMotionUsageDescription(), CMPedometer.isStepCountingAvailable() else {
        promise.resolve(self.permissionResult(status: "denied", canAskAgain: false))
        return
      }

      let currentStatus = CMPedometer.authorizationStatus()
      if currentStatus != .notDetermined {
        promise.resolve(self.currentMotionPermissionResult())
        return
      }

      // Querying CMPedometer prompts the OS Motion & Fitness permission dialog on first access.
      let now = Date()
      var resolved = false
      let resolveQueue = self.stateQueue
      let timeoutWork = DispatchWorkItem { [weak self] in
        guard let self = self, !resolved else { return }
        resolved = true
        promise.resolve(self.currentMotionPermissionResult())
      }
      resolveQueue.asyncAfter(deadline: .now() + 30.0, execute: timeoutWork)

      self.pedometer.queryPedometerData(from: now, to: now) { [weak self] _, _ in
        resolveQueue.async {
          guard let self = self, !resolved else { return }
          resolved = true
          timeoutWork.cancel()
          promise.resolve(self.currentMotionPermissionResult())
        }
      }
    }

    AsyncFunction("requestNotificationPermissionAsync") { () -> [String: Any] in
      // iOS uses CoreMotion hardware history without a foreground service notification.
      return self.permissionResult(status: "granted", canAskAgain: true)
    }

    AsyncFunction("startSessionAsync") { (options: StartPedometerSessionOptions) -> [String: Any] in
      let nowMs = Date().timeIntervalSince1970 * 1000.0
      let initialSteps = Int64(max(0, options.initialSyncedSteps))

      let snapshotDict = self.stateQueue.sync { () -> [String: Any] in
        self.state.mutationGen += 1
        let sameActiveSession =
          self.state.sessionId == options.sessionId && self.state.isRecording

        if sameActiveSession {
          self.state.accumulatedSteps = max(self.state.accumulatedSteps, initialSteps)
          if self.state.activeSegmentStartMs <= 0 {
            self.state.activeSegmentStartMs = nowMs
          }
        } else {
          self.state = PersistedState(
            sessionId: options.sessionId,
            isRecording: true,
            accumulatedSteps: initialSteps,
            activeSegmentStartMs: nowMs,
            liveSegmentSteps: 0,
            lastStepTimestampMs: nowMs,
            mutationGen: self.state.mutationGen
          )
        }

        self.saveStateLocked()
        return self.state.toDictionary()
      }

      self.restartLiveUpdates()
      return snapshotDict
    }

    AsyncFunction("pauseSessionAsync") { (promise: Promise) in
      self.stopLiveUpdates()
      let pauseAt = Date()
      let pauseAtMs = pauseAt.timeIntervalSince1970 * 1000.0

      let pauseContext: (segStartMs: Double, liveBeforePause: Int64, gen: Int64, snapshot: [String: Any]) =
        self.stateQueue.sync {
          self.state.mutationGen += 1
          let gen = self.state.mutationGen
          let segStartMs = self.state.activeSegmentStartMs
          let liveBeforePause = self.state.liveSegmentSteps

          self.state.isRecording = false
          self.state.accumulatedSteps += liveBeforePause
          self.state.liveSegmentSteps = 0
          self.state.activeSegmentStartMs = 0
          self.saveStateLocked()

          return (segStartMs, liveBeforePause, gen, self.state.toDictionary())
        }

      guard self.canAccessAuthorizedPedometer(), pauseContext.segStartMs > 0 else {
        promise.resolve(pauseContext.snapshot)
        return
      }

      let fromDate = Date(timeIntervalSince1970: pauseContext.segStartMs / 1000.0)
      var settled = false
      let timeoutWork = DispatchWorkItem { [weak self] in
        guard let self = self, !settled else { return }
        settled = true
        let fallbackSnap = self.stateQueue.sync { self.state.toDictionary() }
        promise.resolve(fallbackSnap)
      }
      self.stateQueue.asyncAfter(deadline: .now() + 0.35, execute: timeoutWork)

      self.pedometer.queryPedometerData(from: fromDate, to: pauseAt) { [weak self] data, error in
        guard let self = self else { return }
        self.stateQueue.async {
          guard !settled else { return }
          settled = true
          timeoutWork.cancel()

          if error == nil, let data = data, self.state.mutationGen == pauseContext.gen {
            let queriedSteps = max(0, data.numberOfSteps.int64Value)
            let tailDelta = max(0, queriedSteps - pauseContext.liveBeforePause)
            if tailDelta > 0 {
              self.state.accumulatedSteps += tailDelta
              self.state.lastStepTimestampMs = pauseAtMs
              self.saveStateLocked()
            }
          }
          promise.resolve(self.state.toDictionary())
        }
      }
    }

    AsyncFunction("resumeSessionAsync") { (_: ResumePedometerSessionOptions?) -> [String: Any] in
      let nowMs = Date().timeIntervalSince1970 * 1000.0
      let snapshotDict = self.stateQueue.sync { () -> [String: Any] in
        self.state.mutationGen += 1
        self.state.isRecording = true
        self.state.liveSegmentSteps = 0
        self.state.activeSegmentStartMs = nowMs
        self.state.lastStepTimestampMs = nowMs
        self.saveStateLocked()
        return self.state.toDictionary()
      }

      self.restartLiveUpdates()
      return snapshotDict
    }

    AsyncFunction("stopSessionAsync") { () -> [String: Any] in
      self.stopLiveUpdates()
      return self.stateQueue.sync {
        let nextGen = self.state.mutationGen + 1
        self.state = PersistedState(
          sessionId: nil,
          isRecording: false,
          accumulatedSteps: 0,
          activeSegmentStartMs: 0,
          liveSegmentSteps: 0,
          lastStepTimestampMs: 0,
          mutationGen: nextGen
        )
        self.clearStateLocked()
        return self.state.toDictionary()
      }
    }

    AsyncFunction("getSessionSnapshotAsync") { (promise: Promise) in
      self.reconcileActiveSegmentLocked(emitIfChanged: false) { snapshotDict in
        promise.resolve(snapshotDict)
      }
    }
  }

  private func hasMotionUsageDescription() -> Bool {
    return Bundle.main.object(forInfoDictionaryKey: "NSMotionUsageDescription") != nil
  }

  private func canAccessAuthorizedPedometer() -> Bool {
    guard hasMotionUsageDescription(), CMPedometer.isStepCountingAvailable() else {
      return false
    }
    return CMPedometer.authorizationStatus() == .authorized
  }

  private func permissionResult(status: String, canAskAgain: Bool) -> [String: Any] {
    return [
      "status": status,
      "granted": status == "granted",
      "canAskAgain": canAskAgain,
      "expires": "never"
    ]
  }

  private func currentMotionPermissionResult() -> [String: Any] {
    switch CMPedometer.authorizationStatus() {
    case .authorized:
      return permissionResult(status: "granted", canAskAgain: false)
    case .denied, .restricted:
      return permissionResult(status: "denied", canAskAgain: false)
    case .notDetermined:
      return permissionResult(status: "undetermined", canAskAgain: true)
    @unknown default:
      return permissionResult(status: "undetermined", canAskAgain: true)
    }
  }

  private func restartLiveUpdates() {
    stopLiveUpdates()
    startLiveUpdatesIfNeeded()
  }

  private func stopLiveUpdates() {
    stateQueue.sync {
      if isObservingUpdates {
        pedometer.stopUpdates()
        isObservingUpdates = false
      }
    }
  }

  private func startLiveUpdatesIfNeeded() {
    guard canAccessAuthorizedPedometer() else {
      return
    }

    let startInfo: (shouldStart: Bool, fromDate: Date, expectedGen: Int64, expectedSegStartMs: Double) =
      stateQueue.sync {
        guard state.isRecording, state.activeSegmentStartMs > 0 else {
          return (false, Date(), state.mutationGen, 0)
        }
        isObservingUpdates = true
        return (
          true,
          Date(timeIntervalSince1970: state.activeSegmentStartMs / 1000.0),
          state.mutationGen,
          state.activeSegmentStartMs
        )
      }

    guard startInfo.shouldStart else { return }

    pedometer.startUpdates(from: startInfo.fromDate) { [weak self] data, error in
      guard let self = self, error == nil, let data = data else { return }
      let reportedSteps = max(0, data.numberOfSteps.int64Value)
      let eventTimestampMs = max(
        Date().timeIntervalSince1970 * 1000.0,
        data.endDate.timeIntervalSince1970 * 1000.0
      )

      var payloadToEmit: [String: Any]?
      self.stateQueue.sync {
        guard
          self.state.isRecording,
          self.state.mutationGen == startInfo.expectedGen,
          self.state.activeSegmentStartMs == startInfo.expectedSegStartMs
        else {
          return
        }

        let previousTotal = self.state.totalSteps
        if reportedSteps > self.state.liveSegmentSteps {
          self.state.liveSegmentSteps = reportedSteps
          self.state.lastStepTimestampMs = eventTimestampMs
          self.saveStateLocked()

          if self.state.totalSteps > previousTotal {
            payloadToEmit = [
              "sessionId": self.state.sessionId ?? "",
              "totalSteps": Double(self.state.totalSteps),
              "timestampMs": self.state.lastStepTimestampMs,
              "isForegroundServiceRunning": false
            ]
          }
        }
      }

      if let payload = payloadToEmit {
        self.sendEvent(stepUpdateEvent, payload)
      }
    }
  }

  private func reconcileActiveSegmentLocked(
    emitIfChanged: Bool,
    completion: (([String: Any]) -> Void)?
  ) {
    let queryInfo: (
      canQuery: Bool,
      segStartMs: Double,
      gen: Int64,
      fallbackSnapshot: [String: Any]
    ) = stateQueue.sync {
      return (
        self.state.isRecording && self.state.activeSegmentStartMs > 0,
        self.state.activeSegmentStartMs,
        self.state.mutationGen,
        self.state.toDictionary()
      )
    }

    guard queryInfo.canQuery, canAccessAuthorizedPedometer() else {
      completion?(queryInfo.fallbackSnapshot)
      return
    }

    let now = Date()
    let nowMs = now.timeIntervalSince1970 * 1000.0
    let fromDate = Date(timeIntervalSince1970: queryInfo.segStartMs / 1000.0)
    var settled = false

    let timeoutWork = DispatchWorkItem { [weak self] in
      guard let self = self, !settled else { return }
      settled = true
      let snap = self.stateQueue.sync { self.state.toDictionary() }
      completion?(snap)
    }
    stateQueue.asyncAfter(deadline: .now() + 0.35, execute: timeoutWork)

    pedometer.queryPedometerData(from: fromDate, to: now) { [weak self] data, error in
      guard let self = self else { return }
      var eventPayload: [String: Any]?
      let finalSnapshot: [String: Any] = self.stateQueue.sync {
        guard !settled else {
          return self.state.toDictionary()
        }
        settled = true
        timeoutWork.cancel()

        if
          error == nil,
          let data = data,
          self.state.isRecording,
          self.state.mutationGen == queryInfo.gen,
          self.state.activeSegmentStartMs == queryInfo.segStartMs
        {
          let queriedSteps = max(0, data.numberOfSteps.int64Value)
          let previousTotal = self.state.totalSteps
          if queriedSteps > self.state.liveSegmentSteps {
            self.state.liveSegmentSteps = queriedSteps
            self.state.lastStepTimestampMs = max(
              nowMs,
              data.endDate.timeIntervalSince1970 * 1000.0
            )
            self.saveStateLocked()

            if emitIfChanged && self.state.totalSteps > previousTotal {
              eventPayload = [
                "sessionId": self.state.sessionId ?? "",
                "totalSteps": Double(self.state.totalSteps),
                "timestampMs": self.state.lastStepTimestampMs,
                "isForegroundServiceRunning": false
              ]
            }
          }
        }
        return self.state.toDictionary()
      }

      if let payload = eventPayload {
        self.sendEvent(stepUpdateEvent, payload)
      }
      completion?(finalSnapshot)
    }
  }

  private func loadState() -> PersistedState {
    let defaults = UserDefaults.standard
    let sessionId = defaults.string(forKey: PrefKeys.sessionId)
    let isRecording = defaults.bool(forKey: PrefKeys.isRecording)
    let accumulated = Int64(defaults.integer(forKey: PrefKeys.accumulatedSteps))
    let segStartMs = defaults.double(forKey: PrefKeys.activeSegmentStartMs)
    let liveSteps = Int64(defaults.integer(forKey: PrefKeys.liveSegmentSteps))
    let lastTsMs = defaults.double(forKey: PrefKeys.lastStepTimestampMs)

    return PersistedState(
      sessionId: sessionId,
      isRecording: isRecording,
      accumulatedSteps: max(0, accumulated),
      activeSegmentStartMs: max(0, segStartMs),
      liveSegmentSteps: max(0, liveSteps),
      lastStepTimestampMs: max(0, lastTsMs),
      mutationGen: 0
    )
  }

  private func saveStateLocked() {
    let defaults = UserDefaults.standard
    defaults.set(state.sessionId, forKey: PrefKeys.sessionId)
    defaults.set(state.isRecording, forKey: PrefKeys.isRecording)
    defaults.set(Int(state.accumulatedSteps), forKey: PrefKeys.accumulatedSteps)
    defaults.set(state.activeSegmentStartMs, forKey: PrefKeys.activeSegmentStartMs)
    defaults.set(Int(state.liveSegmentSteps), forKey: PrefKeys.liveSegmentSteps)
    defaults.set(state.lastStepTimestampMs, forKey: PrefKeys.lastStepTimestampMs)
  }

  private func clearStateLocked() {
    let defaults = UserDefaults.standard
    defaults.removeObject(forKey: PrefKeys.sessionId)
    defaults.removeObject(forKey: PrefKeys.isRecording)
    defaults.removeObject(forKey: PrefKeys.accumulatedSteps)
    defaults.removeObject(forKey: PrefKeys.activeSegmentStartMs)
    defaults.removeObject(forKey: PrefKeys.liveSegmentSteps)
    defaults.removeObject(forKey: PrefKeys.lastStepTimestampMs)
  }
}

