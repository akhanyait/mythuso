"""Create a deterministic, dependency-free Xcode project for the native UI preview."""
from pathlib import Path
import hashlib
root = Path(__file__).resolve().parents[1] / 'apps/ios'
uid = lambda value: hashlib.sha1(value.encode()).hexdigest()[:24].upper()
objects = []
def obj(key, body):
    objects.append(f'{uid(key)} = {{ {body} }};')
files = sorted((root / 'MyThuso').rglob('*.swift'))
refs, builds = [], []
for file in files:
    path = str(file.relative_to(root))
    refs.append(uid(path))
    builds.append(uid(path + '-build'))
    obj(path, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "{path}"; sourceTree = "<group>";')
    obj(path + '-build', f'isa = PBXBuildFile; fileRef = {uid(path)};')
obj('assets', 'isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = MyThuso/Assets.xcassets; sourceTree = "<group>";')
obj('assets-build', f'isa = PBXBuildFile; fileRef = {uid("assets")};')
obj('product', 'isa = PBXFileReference; explicitFileType = wrapper.application; path = MyThuso.app; sourceTree = BUILT_PRODUCTS_DIR;')
obj('products', f'isa = PBXGroup; children = ({uid("product")}); name = Products; sourceTree = "<group>";')
obj('root', f'isa = PBXGroup; children = ({",".join(refs + [uid("assets"),uid("products")])}); sourceTree = "<group>";')
obj('sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({",".join(builds)}); runOnlyForDeploymentPostprocessing = 0;')
obj('resources', f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({uid("assets-build")}); runOnlyForDeploymentPostprocessing = 0;')
obj('frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
settings = 'SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES;'
target = 'PRODUCT_BUNDLE_IDENTIFIER = za.co.mythuso.preview; PRODUCT_NAME = MyThuso; GENERATE_INFOPLIST_FILE = YES; INFOPLIST_KEY_UILaunchScreen_Generation = YES; INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES; TARGETED_DEVICE_FAMILY = "1,2"; CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 0.1.0; CODE_SIGN_STYLE = Automatic; ENABLE_USER_SCRIPT_SANDBOXING = YES;'
for scope in ['project','target']:
    for config in ['Debug','Release']:
        extra = ' SWIFT_OPTIMIZATION_LEVEL = "-Onone"; DEBUG_INFORMATION_FORMAT = dwarf;' if config == 'Debug' else ' SWIFT_OPTIMIZATION_LEVEL = "-O";'
        obj(scope+config, f'isa = XCBuildConfiguration; name = {config}; buildSettings = {{ {settings if scope=="project" else target} {extra} }};')
    obj(scope+'configs', f'isa = XCConfigurationList; buildConfigurations = ({uid(scope+"Debug")},{uid(scope+"Release")}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('target', f'isa = PBXNativeTarget; buildConfigurationList = {uid("targetconfigs")}; buildPhases = ({uid("sources")},{uid("frameworks")},{uid("resources")}); buildRules = (); dependencies = (); name = MyThuso; productName = MyThuso; productReference = {uid("product")}; productType = "com.apple.product-type.application";')
obj('project', f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {uid("projectconfigs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en,Base); mainGroup = {uid("root")}; productRefGroup = {uid("products")}; projectDirPath = ""; projectRoot = ""; targets = ({uid("target")});')
project = root / 'MyThuso.xcodeproj'
project.mkdir(exist_ok=True)
(project / 'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' + '\n'.join(objects) + f'\n}}; rootObject = {uid("project")}; }}\n')
print(project)
