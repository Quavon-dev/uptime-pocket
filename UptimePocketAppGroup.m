//
//  UptimePocketAppGroup.m
//  UptimePocket
//
//  Objective-C bridge for the UptimePocketAppGroup Swift
//  module. React Native's bridge uses Objective-C runtime
//  introspection to discover @objc methods, so Swift classes
//  need a corresponding .m file to register themselves with
//  the bridge.
//
//  This file is added to the MAIN APP target by the
//  `uptime-pocket-ios-widget` config plugin.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(UptimePocketAppGroup, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(writeSnapshot:(NSString *)filename
                  json:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup;

@end
