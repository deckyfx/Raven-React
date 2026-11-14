# The addon of Raven's Node.js binding (raven_napi.node) on Windows, which Raven's own CMake leaves
# out: there an addon links against the import library of node.exe (node.lib), which Node.js
# publishes beside its headers. The release workflow downloads both for the Node.js it runs, then:
#
#   cmake -S packages/raven-tsx/addon -B raven-source/build-node -A x64 \
#     -DRAVEN_SOURCE=<Raven checkout> -DNODE_INCLUDE_DIR=<node-vX/include/node> -DNODE_LIBRARY=<node.lib>
#   cmake --build raven-source/build-node --config Release
#
# The source is Raven's, at the pin, unchanged: it opens the library with LoadLibrary on Windows.

cmake_minimum_required(VERSION 3.16)
project(raven_node_windows C)

foreach(variable RAVEN_SOURCE NODE_INCLUDE_DIR NODE_LIBRARY)
	if(NOT ${variable})
		message(FATAL_ERROR "${variable} is not set: see the head of this file")
	endif()
endforeach()

add_library(raven_node MODULE "${RAVEN_SOURCE}/bindings/node/src/raven_napi.c")
set_target_properties(raven_node PROPERTIES PREFIX "" SUFFIX ".node" OUTPUT_NAME raven_napi C_STANDARD 11)
target_include_directories(raven_node PRIVATE "${NODE_INCLUDE_DIR}" "${RAVEN_SOURCE}/include")
target_compile_definitions(raven_node PRIVATE NAPI_DISABLE_CPP_EXCEPTIONS)
target_link_libraries(raven_node PRIVATE "${NODE_LIBRARY}")
