"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/tiktok-sync/route";
exports.ids = ["app/api/tiktok-sync/route"];
exports.modules = {

/***/ "@prisma/client":
/*!*********************************!*\
  !*** external "@prisma/client" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ "./action-async-storage.external?8dda":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "./request-async-storage.external?3d59":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "./static-generation-async-storage.external?16bc":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("assert");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("events");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "querystring":
/*!******************************!*\
  !*** external "querystring" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("querystring");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Ftiktok-sync%2Froute&page=%2Fapi%2Ftiktok-sync%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Ftiktok-sync%2Froute.ts&appDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Ftiktok-sync%2Froute&page=%2Fapi%2Ftiktok-sync%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Ftiktok-sync%2Froute.ts&appDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_yuyuhan_Desktop_dev_wig_management_src_app_api_tiktok_sync_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/tiktok-sync/route.ts */ \"(rsc)/./src/app/api/tiktok-sync/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/tiktok-sync/route\",\n        pathname: \"/api/tiktok-sync\",\n        filename: \"route\",\n        bundlePath: \"app/api/tiktok-sync/route\"\n    },\n    resolvedPagePath: \"/Users/yuyuhan/Desktop/dev/wig-management/src/app/api/tiktok-sync/route.ts\",\n    nextConfigOutput,\n    userland: _Users_yuyuhan_Desktop_dev_wig_management_src_app_api_tiktok_sync_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/tiktok-sync/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZ0aWt0b2stc3luYyUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGdGlrdG9rLXN5bmMlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZ0aWt0b2stc3luYyUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRnl1eXVoYW4lMkZEZXNrdG9wJTJGZGV2JTJGd2lnLW1hbmFnZW1lbnQlMkZzcmMlMkZhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPSUyRlVzZXJzJTJGeXV5dWhhbiUyRkRlc2t0b3AlMkZkZXYlMkZ3aWctbWFuYWdlbWVudCZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7O0FBQXNHO0FBQ3ZDO0FBQ2M7QUFDMEI7QUFDdkc7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLGdIQUFtQjtBQUMzQztBQUNBLGNBQWMseUVBQVM7QUFDdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTtBQUNBLFlBQVk7QUFDWixDQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0EsUUFBUSxpRUFBaUU7QUFDekU7QUFDQTtBQUNBLFdBQVcsNEVBQVc7QUFDdEI7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUN1SDs7QUFFdkgiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aWctbWFuYWdlbWVudC8/NzNkYiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCIvVXNlcnMveXV5dWhhbi9EZXNrdG9wL2Rldi93aWctbWFuYWdlbWVudC9zcmMvYXBwL2FwaS90aWt0b2stc3luYy9yb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvdGlrdG9rLXN5bmMvcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS90aWt0b2stc3luY1wiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvdGlrdG9rLXN5bmMvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCIvVXNlcnMveXV5dWhhbi9EZXNrdG9wL2Rldi93aWctbWFuYWdlbWVudC9zcmMvYXBwL2FwaS90aWt0b2stc3luYy9yb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvdGlrdG9rLXN5bmMvcm91dGVcIjtcbmZ1bmN0aW9uIHBhdGNoRmV0Y2goKSB7XG4gICAgcmV0dXJuIF9wYXRjaEZldGNoKHtcbiAgICAgICAgc2VydmVySG9va3MsXG4gICAgICAgIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2VcbiAgICB9KTtcbn1cbmV4cG9ydCB7IHJvdXRlTW9kdWxlLCByZXF1ZXN0QXN5bmNTdG9yYWdlLCBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlLCBzZXJ2ZXJIb29rcywgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Ftiktok-sync%2Froute&page=%2Fapi%2Ftiktok-sync%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Ftiktok-sync%2Froute.ts&appDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/tiktok-sync/route.ts":
/*!******************************************!*\
  !*** ./src/app/api/tiktok-sync/route.ts ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   DELETE: () => (/* binding */ DELETE),\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   POST: () => (/* binding */ POST)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth */ \"(rsc)/./node_modules/next-auth/index.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_auth__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _lib_auth__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/lib/auth */ \"(rsc)/./src/lib/auth.ts\");\n/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/lib/prisma */ \"(rsc)/./src/lib/prisma.ts\");\n\n\n\n\n// 获取 TikTok 同步数据\nasync function GET() {\n    try {\n        const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n        if (!session) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"未登录\"\n            }, {\n                status: 401\n            });\n        }\n        const syncs = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.tiktokSync.findMany({\n            orderBy: {\n                syncedAt: \"desc\"\n            },\n            include: {\n                product: true\n            }\n        });\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            syncs\n        });\n    } catch (error) {\n        console.error(\"获取 TikTok 同步数据失败:\", error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"获取数据失败\"\n        }, {\n            status: 500\n        });\n    }\n}\n// 批量创建/更新 TikTok 同步数据\nasync function POST(request) {\n    try {\n        const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n        if (!session) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"未登录\"\n            }, {\n                status: 401\n            });\n        }\n        const userRole = session.user.role;\n        if (userRole !== \"admin\" && userRole !== \"operator\") {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"无权限\"\n            }, {\n                status: 403\n            });\n        }\n        const data = await request.json();\n        const items = data.items || [];\n        if (!Array.isArray(items) || items.length === 0) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"无效的数据格式\"\n            }, {\n                status: 400\n            });\n        }\n        // 由于 TiktokSync.sku 关联 Product.sku（外键），需要确保 Product 先存在\n        // 用事务批量执行：先 upsert Product（最小信息），再 upsert TiktokSync\n        const ops = items.flatMap((item)=>{\n            const sku = String(item.sku || \"\").trim();\n            if (!sku) return [];\n            const priceUsd = typeof item.priceUsd === \"number\" ? item.priceUsd : Number(item.priceUsd) || 0;\n            const stock = typeof item.stock === \"number\" ? item.stock : Number(item.stock) || 0;\n            const title = item.title ? String(item.title) : \"\";\n            return [\n                _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.product.upsert({\n                    where: {\n                        sku\n                    },\n                    create: {\n                        sku,\n                        name: title || sku,\n                        priceUsd,\n                        stock,\n                        tiktokPriceUsd: priceUsd\n                    },\n                    update: {\n                        // 不覆盖运营侧已维护的核心字段（如 name/description 等），只同步库存/价格\n                        stock,\n                        tiktokPriceUsd: priceUsd\n                    }\n                }),\n                _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.tiktokSync.upsert({\n                    where: {\n                        sku\n                    },\n                    create: {\n                        sku,\n                        skuId: item.skuId,\n                        title: item.title,\n                        priceUsd,\n                        originalPriceUsd: item.originalPriceUsd,\n                        stock,\n                        status: item.status\n                    },\n                    update: {\n                        skuId: item.skuId,\n                        title: item.title,\n                        priceUsd,\n                        originalPriceUsd: item.originalPriceUsd,\n                        stock,\n                        status: item.status,\n                        syncedAt: new Date()\n                    }\n                })\n            ];\n        });\n        const results = await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.$transaction(ops);\n        const syncedCount = Math.floor(results.length / 2);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            success: true,\n            count: syncedCount\n        });\n    } catch (error) {\n        console.error(\"同步 TikTok 数据失败:\", error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"同步失败\"\n        }, {\n            status: 500\n        });\n    }\n}\n// 清空 TikTok 同步数据\nasync function DELETE() {\n    try {\n        const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n        if (!session) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"未登录\"\n            }, {\n                status: 401\n            });\n        }\n        const userRole = session.user.role;\n        if (userRole !== \"admin\" && userRole !== \"operator\") {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                error: \"无权限\"\n            }, {\n                status: 403\n            });\n        }\n        await _lib_prisma__WEBPACK_IMPORTED_MODULE_3__.prisma.tiktokSync.deleteMany();\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            success: true\n        });\n    } catch (error) {\n        console.error(\"清空 TikTok 同步数据失败:\", error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"清空失败\"\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,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TSxJQUFJLENBQUM7Z0JBQUVDLE9BQU87WUFBTSxHQUFHO2dCQUFFQyxRQUFRO1lBQUk7UUFDM0Q7UUFFQSxNQUFNTCwrQ0FBTUEsQ0FBQ08sVUFBVSxDQUFDNEMsVUFBVTtRQUVsQyxPQUFPdEQscURBQVlBLENBQUNNLElBQUksQ0FBQztZQUFFNkMsU0FBUztRQUFLO0lBQzNDLEVBQUUsT0FBTzVDLE9BQU87UUFDZFMsUUFBUVQsS0FBSyxDQUFDLHFCQUFxQkE7UUFDbkMsT0FBT1AscURBQVlBLENBQUNNLElBQUksQ0FBQztZQUFFQyxPQUFPO1FBQU8sR0FBRztZQUFFQyxRQUFRO1FBQUk7SUFDNUQ7QUFDRiIsInNvdXJjZXMiOlsid2VicGFjazovL3dpZy1tYW5hZ2VtZW50Ly4vc3JjL2FwcC9hcGkvdGlrdG9rLXN5bmMvcm91dGUudHM/MDZjOCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVxdWVzdCwgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInXG5pbXBvcnQgeyBnZXRTZXJ2ZXJTZXNzaW9uIH0gZnJvbSAnbmV4dC1hdXRoJ1xuaW1wb3J0IHsgYXV0aE9wdGlvbnMgfSBmcm9tICdAL2xpYi9hdXRoJ1xuaW1wb3J0IHsgcHJpc21hIH0gZnJvbSAnQC9saWIvcHJpc21hJ1xuXG4vLyDojrflj5YgVGlrVG9rIOWQjOatpeaVsOaNrlxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIEdFVCgpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgZ2V0U2VydmVyU2Vzc2lvbihhdXRoT3B0aW9ucylcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAn5pyq55m75b2VJyB9LCB7IHN0YXR1czogNDAxIH0pXG4gICAgfVxuXG4gICAgY29uc3Qgc3luY3MgPSBhd2FpdCBwcmlzbWEudGlrdG9rU3luYy5maW5kTWFueSh7XG4gICAgICBvcmRlckJ5OiB7IHN5bmNlZEF0OiAnZGVzYycgfSxcbiAgICAgIGluY2x1ZGU6IHtcbiAgICAgICAgcHJvZHVjdDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IHN5bmNzIH0pXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign6I635Y+WIFRpa1RvayDlkIzmraXmlbDmja7lpLHotKU6JywgZXJyb3IpXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICfojrflj5bmlbDmja7lpLHotKUnIH0sIHsgc3RhdHVzOiA1MDAgfSlcbiAgfVxufVxuXG4vLyDmibnph4/liJvlu7ov5pu05pawIFRpa1RvayDlkIzmraXmlbDmja5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBQT1NUKHJlcXVlc3Q6IE5leHRSZXF1ZXN0KSB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGdldFNlcnZlclNlc3Npb24oYXV0aE9wdGlvbnMpXG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogJ+acqueZu+W9lScgfSwgeyBzdGF0dXM6IDQwMSB9KVxuICAgIH1cblxuICAgIGNvbnN0IHVzZXJSb2xlID0gKHNlc3Npb24udXNlciBhcyBhbnkpLnJvbGVcbiAgICBpZiAodXNlclJvbGUgIT09ICdhZG1pbicgJiYgdXNlclJvbGUgIT09ICdvcGVyYXRvcicpIHtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAn5peg5p2D6ZmQJyB9LCB7IHN0YXR1czogNDAzIH0pXG4gICAgfVxuXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcXVlc3QuanNvbigpXG4gICAgY29uc3QgaXRlbXMgPSBkYXRhLml0ZW1zIHx8IFtdXG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoaXRlbXMpIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICfml6DmlYjnmoTmlbDmja7moLzlvI8nIH0sIHsgc3RhdHVzOiA0MDAgfSlcbiAgICB9XG5cbiAgICAvLyDnlLHkuo4gVGlrdG9rU3luYy5za3Ug5YWz6IGUIFByb2R1Y3Quc2t177yI5aSW6ZSu77yJ77yM6ZyA6KaB56Gu5L+dIFByb2R1Y3Qg5YWI5a2Y5ZyoXG4gICAgLy8g55So5LqL5Yqh5om56YeP5omn6KGM77ya5YWIIHVwc2VydCBQcm9kdWN077yI5pyA5bCP5L+h5oGv77yJ77yM5YaNIHVwc2VydCBUaWt0b2tTeW5jXG4gICAgY29uc3Qgb3BzID0gaXRlbXMuZmxhdE1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICBjb25zdCBza3UgPSBTdHJpbmcoaXRlbS5za3UgfHwgJycpLnRyaW0oKVxuICAgICAgaWYgKCFza3UpIHJldHVybiBbXVxuXG4gICAgICBjb25zdCBwcmljZVVzZCA9IHR5cGVvZiBpdGVtLnByaWNlVXNkID09PSAnbnVtYmVyJyA/IGl0ZW0ucHJpY2VVc2QgOiBOdW1iZXIoaXRlbS5wcmljZVVzZCkgfHwgMFxuICAgICAgY29uc3Qgc3RvY2sgPSB0eXBlb2YgaXRlbS5zdG9jayA9PT0gJ251bWJlcicgPyBpdGVtLnN0b2NrIDogTnVtYmVyKGl0ZW0uc3RvY2spIHx8IDBcbiAgICAgIGNvbnN0IHRpdGxlID0gaXRlbS50aXRsZSA/IFN0cmluZyhpdGVtLnRpdGxlKSA6ICcnXG5cbiAgICAgIHJldHVybiBbXG4gICAgICAgIHByaXNtYS5wcm9kdWN0LnVwc2VydCh7XG4gICAgICAgICAgd2hlcmU6IHsgc2t1IH0sXG4gICAgICAgICAgY3JlYXRlOiB7XG4gICAgICAgICAgICBza3UsXG4gICAgICAgICAgICBuYW1lOiB0aXRsZSB8fCBza3UsXG4gICAgICAgICAgICBwcmljZVVzZCxcbiAgICAgICAgICAgIHN0b2NrLFxuICAgICAgICAgICAgdGlrdG9rUHJpY2VVc2Q6IHByaWNlVXNkLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgdXBkYXRlOiB7XG4gICAgICAgICAgICAvLyDkuI3opobnm5bov5DokKXkvqflt7Lnu7TmiqTnmoTmoLjlv4PlrZfmrrXvvIjlpoIgbmFtZS9kZXNjcmlwdGlvbiDnrYnvvInvvIzlj6rlkIzmraXlupPlrZgv5Lu35qC8XG4gICAgICAgICAgICBzdG9jayxcbiAgICAgICAgICAgIHRpa3Rva1ByaWNlVXNkOiBwcmljZVVzZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgcHJpc21hLnRpa3Rva1N5bmMudXBzZXJ0KHtcbiAgICAgICAgICB3aGVyZTogeyBza3UgfSxcbiAgICAgICAgICBjcmVhdGU6IHtcbiAgICAgICAgICAgIHNrdSxcbiAgICAgICAgICAgIHNrdUlkOiBpdGVtLnNrdUlkLFxuICAgICAgICAgICAgdGl0bGU6IGl0ZW0udGl0bGUsXG4gICAgICAgICAgICBwcmljZVVzZCxcbiAgICAgICAgICAgIG9yaWdpbmFsUHJpY2VVc2Q6IGl0ZW0ub3JpZ2luYWxQcmljZVVzZCxcbiAgICAgICAgICAgIHN0b2NrLFxuICAgICAgICAgICAgc3RhdHVzOiBpdGVtLnN0YXR1cyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHVwZGF0ZToge1xuICAgICAgICAgICAgc2t1SWQ6IGl0ZW0uc2t1SWQsXG4gICAgICAgICAgICB0aXRsZTogaXRlbS50aXRsZSxcbiAgICAgICAgICAgIHByaWNlVXNkLFxuICAgICAgICAgICAgb3JpZ2luYWxQcmljZVVzZDogaXRlbS5vcmlnaW5hbFByaWNlVXNkLFxuICAgICAgICAgICAgc3RvY2ssXG4gICAgICAgICAgICBzdGF0dXM6IGl0ZW0uc3RhdHVzLFxuICAgICAgICAgICAgc3luY2VkQXQ6IG5ldyBEYXRlKCksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICBdXG4gICAgfSlcblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBwcmlzbWEuJHRyYW5zYWN0aW9uKG9wcylcbiAgICBjb25zdCBzeW5jZWRDb3VudCA9IE1hdGguZmxvb3IocmVzdWx0cy5sZW5ndGggLyAyKVxuXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBjb3VudDogc3luY2VkQ291bnQsXG4gICAgfSlcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCflkIzmraUgVGlrVG9rIOaVsOaNruWksei0pTonLCBlcnJvcilcbiAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogJ+WQjOatpeWksei0pScgfSwgeyBzdGF0dXM6IDUwMCB9KVxuICB9XG59XG5cbi8vIOa4heepuiBUaWtUb2sg5ZCM5q2l5pWw5o2uXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gREVMRVRFKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBnZXRTZXJ2ZXJTZXNzaW9uKGF1dGhPcHRpb25zKVxuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICfmnKrnmbvlvZUnIH0sIHsgc3RhdHVzOiA0MDEgfSlcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyUm9sZSA9IChzZXNzaW9uLnVzZXIgYXMgYW55KS5yb2xlXG4gICAgaWYgKHVzZXJSb2xlICE9PSAnYWRtaW4nICYmIHVzZXJSb2xlICE9PSAnb3BlcmF0b3InKSB7XG4gICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oeyBlcnJvcjogJ+aXoOadg+mZkCcgfSwgeyBzdGF0dXM6IDQwMyB9KVxuICAgIH1cblxuICAgIGF3YWl0IHByaXNtYS50aWt0b2tTeW5jLmRlbGV0ZU1hbnkoKVxuXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+a4heepuiBUaWtUb2sg5ZCM5q2l5pWw5o2u5aSx6LSlOicsIGVycm9yKVxuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbih7IGVycm9yOiAn5riF56m65aSx6LSlJyB9LCB7IHN0YXR1czogNTAwIH0pXG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJnZXRTZXJ2ZXJTZXNzaW9uIiwiYXV0aE9wdGlvbnMiLCJwcmlzbWEiLCJHRVQiLCJzZXNzaW9uIiwianNvbiIsImVycm9yIiwic3RhdHVzIiwic3luY3MiLCJ0aWt0b2tTeW5jIiwiZmluZE1hbnkiLCJvcmRlckJ5Iiwic3luY2VkQXQiLCJpbmNsdWRlIiwicHJvZHVjdCIsImNvbnNvbGUiLCJQT1NUIiwicmVxdWVzdCIsInVzZXJSb2xlIiwidXNlciIsInJvbGUiLCJkYXRhIiwiaXRlbXMiLCJBcnJheSIsImlzQXJyYXkiLCJsZW5ndGgiLCJvcHMiLCJmbGF0TWFwIiwiaXRlbSIsInNrdSIsIlN0cmluZyIsInRyaW0iLCJwcmljZVVzZCIsIk51bWJlciIsInN0b2NrIiwidGl0bGUiLCJ1cHNlcnQiLCJ3aGVyZSIsImNyZWF0ZSIsIm5hbWUiLCJ0aWt0b2tQcmljZVVzZCIsInVwZGF0ZSIsInNrdUlkIiwib3JpZ2luYWxQcmljZVVzZCIsIkRhdGUiLCJyZXN1bHRzIiwiJHRyYW5zYWN0aW9uIiwic3luY2VkQ291bnQiLCJNYXRoIiwiZmxvb3IiLCJzdWNjZXNzIiwiY291bnQiLCJERUxFVEUiLCJkZWxldGVNYW55Il0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/tiktok-sync/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/auth.ts":
/*!*************************!*\
  !*** ./src/lib/auth.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   authOptions: () => (/* binding */ authOptions)\n/* harmony export */ });\n/* harmony import */ var next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next-auth/providers/credentials */ \"(rsc)/./node_modules/next-auth/providers/credentials.js\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! bcryptjs */ \"(rsc)/./node_modules/bcryptjs/index.js\");\n/* harmony import */ var bcryptjs__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(bcryptjs__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _prisma__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./prisma */ \"(rsc)/./src/lib/prisma.ts\");\n\n\n\nconst authOptions = {\n    providers: [\n        (0,next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_0__[\"default\"])({\n            name: \"Credentials\",\n            credentials: {\n                email: {\n                    label: \"邮箱\",\n                    type: \"email\"\n                },\n                password: {\n                    label: \"密码\",\n                    type: \"password\"\n                }\n            },\n            async authorize (credentials) {\n                if (!credentials?.email || !credentials?.password) {\n                    return null;\n                }\n                const user = await _prisma__WEBPACK_IMPORTED_MODULE_2__.prisma.user.findUnique({\n                    where: {\n                        email: credentials.email\n                    }\n                });\n                if (!user) {\n                    return null;\n                }\n                const isPasswordValid = await bcryptjs__WEBPACK_IMPORTED_MODULE_1___default().compare(credentials.password, user.password);\n                if (!isPasswordValid) {\n                    return null;\n                }\n                return {\n                    id: user.id,\n                    email: user.email,\n                    name: user.name,\n                    role: user.role\n                };\n            }\n        })\n    ],\n    session: {\n        strategy: \"jwt\"\n    },\n    callbacks: {\n        async jwt ({ token, user }) {\n            if (user) {\n                token.id = user.id;\n                token.role = user.role;\n            }\n            return token;\n        },\n        async session ({ session, token }) {\n            if (session.user) {\n                session.user.id = token.id;\n                session.user.role = token.role;\n            }\n            return session;\n        }\n    },\n    pages: {\n        signIn: \"/login\"\n    }\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2F1dGgudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFDaUU7QUFDcEM7QUFDSTtBQUUxQixNQUFNRyxjQUErQjtJQUMxQ0MsV0FBVztRQUNUSiwyRUFBbUJBLENBQUM7WUFDbEJLLE1BQU07WUFDTkMsYUFBYTtnQkFDWEMsT0FBTztvQkFBRUMsT0FBTztvQkFBTUMsTUFBTTtnQkFBUTtnQkFDcENDLFVBQVU7b0JBQUVGLE9BQU87b0JBQU1DLE1BQU07Z0JBQVc7WUFDNUM7WUFDQSxNQUFNRSxXQUFVTCxXQUFXO2dCQUN6QixJQUFJLENBQUNBLGFBQWFDLFNBQVMsQ0FBQ0QsYUFBYUksVUFBVTtvQkFDakQsT0FBTztnQkFDVDtnQkFFQSxNQUFNRSxPQUFPLE1BQU1WLDJDQUFNQSxDQUFDVSxJQUFJLENBQUNDLFVBQVUsQ0FBQztvQkFDeENDLE9BQU87d0JBQUVQLE9BQU9ELFlBQVlDLEtBQUs7b0JBQUM7Z0JBQ3BDO2dCQUVBLElBQUksQ0FBQ0ssTUFBTTtvQkFDVCxPQUFPO2dCQUNUO2dCQUVBLE1BQU1HLGtCQUFrQixNQUFNZCx1REFBYyxDQUMxQ0ssWUFBWUksUUFBUSxFQUNwQkUsS0FBS0YsUUFBUTtnQkFHZixJQUFJLENBQUNLLGlCQUFpQjtvQkFDcEIsT0FBTztnQkFDVDtnQkFFQSxPQUFPO29CQUNMRSxJQUFJTCxLQUFLSyxFQUFFO29CQUNYVixPQUFPSyxLQUFLTCxLQUFLO29CQUNqQkYsTUFBTU8sS0FBS1AsSUFBSTtvQkFDZmEsTUFBTU4sS0FBS00sSUFBSTtnQkFDakI7WUFDRjtRQUNGO0tBQ0Q7SUFDREMsU0FBUztRQUNQQyxVQUFVO0lBQ1o7SUFDQUMsV0FBVztRQUNULE1BQU1DLEtBQUksRUFBRUMsS0FBSyxFQUFFWCxJQUFJLEVBQUU7WUFDdkIsSUFBSUEsTUFBTTtnQkFDUlcsTUFBTU4sRUFBRSxHQUFHTCxLQUFLSyxFQUFFO2dCQUNsQk0sTUFBTUwsSUFBSSxHQUFHLEtBQWNBLElBQUk7WUFDakM7WUFDQSxPQUFPSztRQUNUO1FBQ0EsTUFBTUosU0FBUSxFQUFFQSxPQUFPLEVBQUVJLEtBQUssRUFBRTtZQUM5QixJQUFJSixRQUFRUCxJQUFJLEVBQUU7Z0JBQ2ZPLFFBQVFQLElBQUksQ0FBU0ssRUFBRSxHQUFHTSxNQUFNTixFQUFFO2dCQUNsQ0UsUUFBUVAsSUFBSSxDQUFTTSxJQUFJLEdBQUdLLE1BQU1MLElBQUk7WUFDekM7WUFDQSxPQUFPQztRQUNUO0lBQ0Y7SUFDQUssT0FBTztRQUNMQyxRQUFRO0lBQ1Y7QUFDRixFQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vd2lnLW1hbmFnZW1lbnQvLi9zcmMvbGliL2F1dGgudHM/NjY5MiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0QXV0aE9wdGlvbnMgfSBmcm9tICduZXh0LWF1dGgnXG5pbXBvcnQgQ3JlZGVudGlhbHNQcm92aWRlciBmcm9tICduZXh0LWF1dGgvcHJvdmlkZXJzL2NyZWRlbnRpYWxzJ1xuaW1wb3J0IGJjcnlwdCBmcm9tICdiY3J5cHRqcydcbmltcG9ydCB7IHByaXNtYSB9IGZyb20gJy4vcHJpc21hJ1xuXG5leHBvcnQgY29uc3QgYXV0aE9wdGlvbnM6IE5leHRBdXRoT3B0aW9ucyA9IHtcbiAgcHJvdmlkZXJzOiBbXG4gICAgQ3JlZGVudGlhbHNQcm92aWRlcih7XG4gICAgICBuYW1lOiAnQ3JlZGVudGlhbHMnLFxuICAgICAgY3JlZGVudGlhbHM6IHtcbiAgICAgICAgZW1haWw6IHsgbGFiZWw6ICfpgq7nrrEnLCB0eXBlOiAnZW1haWwnIH0sXG4gICAgICAgIHBhc3N3b3JkOiB7IGxhYmVsOiAn5a+G56CBJywgdHlwZTogJ3Bhc3N3b3JkJyB9XG4gICAgICB9LFxuICAgICAgYXN5bmMgYXV0aG9yaXplKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgIGlmICghY3JlZGVudGlhbHM/LmVtYWlsIHx8ICFjcmVkZW50aWFscz8ucGFzc3dvcmQpIHtcbiAgICAgICAgICByZXR1cm4gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXNlciA9IGF3YWl0IHByaXNtYS51c2VyLmZpbmRVbmlxdWUoe1xuICAgICAgICAgIHdoZXJlOiB7IGVtYWlsOiBjcmVkZW50aWFscy5lbWFpbCB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgaWYgKCF1c2VyKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzUGFzc3dvcmRWYWxpZCA9IGF3YWl0IGJjcnlwdC5jb21wYXJlKFxuICAgICAgICAgIGNyZWRlbnRpYWxzLnBhc3N3b3JkLFxuICAgICAgICAgIHVzZXIucGFzc3dvcmRcbiAgICAgICAgKVxuXG4gICAgICAgIGlmICghaXNQYXNzd29yZFZhbGlkKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaWQ6IHVzZXIuaWQsXG4gICAgICAgICAgZW1haWw6IHVzZXIuZW1haWwsXG4gICAgICAgICAgbmFtZTogdXNlci5uYW1lLFxuICAgICAgICAgIHJvbGU6IHVzZXIucm9sZSxcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gIF0sXG4gIHNlc3Npb246IHtcbiAgICBzdHJhdGVneTogJ2p3dCdcbiAgfSxcbiAgY2FsbGJhY2tzOiB7XG4gICAgYXN5bmMgand0KHsgdG9rZW4sIHVzZXIgfSkge1xuICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgdG9rZW4uaWQgPSB1c2VyLmlkXG4gICAgICAgIHRva2VuLnJvbGUgPSAodXNlciBhcyBhbnkpLnJvbGVcbiAgICAgIH1cbiAgICAgIHJldHVybiB0b2tlblxuICAgIH0sXG4gICAgYXN5bmMgc2Vzc2lvbih7IHNlc3Npb24sIHRva2VuIH0pIHtcbiAgICAgIGlmIChzZXNzaW9uLnVzZXIpIHtcbiAgICAgICAgKHNlc3Npb24udXNlciBhcyBhbnkpLmlkID0gdG9rZW4uaWQgYXMgc3RyaW5nXG4gICAgICAgIChzZXNzaW9uLnVzZXIgYXMgYW55KS5yb2xlID0gdG9rZW4ucm9sZSBhcyBzdHJpbmdcbiAgICAgIH1cbiAgICAgIHJldHVybiBzZXNzaW9uXG4gICAgfVxuICB9LFxuICBwYWdlczoge1xuICAgIHNpZ25JbjogJy9sb2dpbicsXG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJDcmVkZW50aWFsc1Byb3ZpZGVyIiwiYmNyeXB0IiwicHJpc21hIiwiYXV0aE9wdGlvbnMiLCJwcm92aWRlcnMiLCJuYW1lIiwiY3JlZGVudGlhbHMiLCJlbWFpbCIsImxhYmVsIiwidHlwZSIsInBhc3N3b3JkIiwiYXV0aG9yaXplIiwidXNlciIsImZpbmRVbmlxdWUiLCJ3aGVyZSIsImlzUGFzc3dvcmRWYWxpZCIsImNvbXBhcmUiLCJpZCIsInJvbGUiLCJzZXNzaW9uIiwic3RyYXRlZ3kiLCJjYWxsYmFja3MiLCJqd3QiLCJ0b2tlbiIsInBhZ2VzIiwic2lnbkluIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/auth.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/prisma.ts":
/*!***************************!*\
  !*** ./src/lib/prisma.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   prisma: () => (/* binding */ prisma)\n/* harmony export */ });\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @prisma/client */ \"@prisma/client\");\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_prisma_client__WEBPACK_IMPORTED_MODULE_0__);\n\nconst globalForPrisma = globalThis;\nconst prisma = globalForPrisma.prisma ?? new _prisma_client__WEBPACK_IMPORTED_MODULE_0__.PrismaClient();\nif (true) globalForPrisma.prisma = prisma;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3ByaXNtYS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBNkM7QUFFN0MsTUFBTUMsa0JBQWtCQztBQUlqQixNQUFNQyxTQUFTRixnQkFBZ0JFLE1BQU0sSUFBSSxJQUFJSCx3REFBWUEsR0FBRTtBQUVsRSxJQUFJSSxJQUF5QixFQUFjSCxnQkFBZ0JFLE1BQU0sR0FBR0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly93aWctbWFuYWdlbWVudC8uL3NyYy9saWIvcHJpc21hLnRzPzAxZDciXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUHJpc21hQ2xpZW50IH0gZnJvbSAnQHByaXNtYS9jbGllbnQnXG5cbmNvbnN0IGdsb2JhbEZvclByaXNtYSA9IGdsb2JhbFRoaXMgYXMgdW5rbm93biBhcyB7XG4gIHByaXNtYTogUHJpc21hQ2xpZW50IHwgdW5kZWZpbmVkXG59XG5cbmV4cG9ydCBjb25zdCBwcmlzbWEgPSBnbG9iYWxGb3JQcmlzbWEucHJpc21hID8/IG5ldyBQcmlzbWFDbGllbnQoKVxuXG5pZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykgZ2xvYmFsRm9yUHJpc21hLnByaXNtYSA9IHByaXNtYVxuIl0sIm5hbWVzIjpbIlByaXNtYUNsaWVudCIsImdsb2JhbEZvclByaXNtYSIsImdsb2JhbFRoaXMiLCJwcmlzbWEiLCJwcm9jZXNzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/prisma.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/next-auth","vendor-chunks/jose","vendor-chunks/openid-client","vendor-chunks/bcryptjs","vendor-chunks/@babel","vendor-chunks/oauth","vendor-chunks/object-hash","vendor-chunks/preact","vendor-chunks/uuid","vendor-chunks/yallist","vendor-chunks/preact-render-to-string","vendor-chunks/lru-cache","vendor-chunks/cookie","vendor-chunks/oidc-token-hash","vendor-chunks/@panva"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Ftiktok-sync%2Froute&page=%2Fapi%2Ftiktok-sync%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Ftiktok-sync%2Froute.ts&appDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management%2Fsrc%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fyuyuhan%2FDesktop%2Fdev%2Fwig-management&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();